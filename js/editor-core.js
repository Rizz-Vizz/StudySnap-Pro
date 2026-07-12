'use strict';

const SSPEditor = (() => {

  function esc(s) {
    const d = document.createElement('div');
    d.innerText = String(s ?? '');
    return d.innerHTML;
  }

  function formatTime(sec) {
    const s = Math.floor(sec), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  const TOOL_REGISTRY = [
    { id: 'undo',           label: 'Undo',              category: 'History',     panel: '.tb[data-cmd="undo"]',           history: '.etb-btn[data-cmd="undo"]' },
    { id: 'redo',           label: 'Redo',              category: 'History',     panel: '.tb[data-cmd="redo"]',           history: '.etb-btn[data-cmd="redo"]' },
    { id: 'block',          label: 'Block Style',       category: 'Structure',   panel: '#block-sel',                     history: '#ep-block' },
    { id: 'bold',           label: 'Bold',              category: 'Formatting',  panel: '.tb[data-cmd="bold"]',           history: '.etb-btn[data-cmd="bold"]' },
    { id: 'italic',         label: 'Italic',            category: 'Formatting',  panel: '.tb[data-cmd="italic"]',         history: '.etb-btn[data-cmd="italic"]' },
    { id: 'underline',      label: 'Underline',         category: 'Formatting',  panel: '.tb[data-cmd="underline"]',      history: '.etb-btn[data-cmd="underline"]' },
    { id: 'strike',         label: 'Strikethrough',     category: 'Formatting',  panel: '.tb[data-cmd="strikeThrough"]',  history: '.etb-btn[data-cmd="strikeThrough"]' },
    { id: 'superscript',    label: 'Superscript',       category: 'Formatting',  panel: '.tb[data-cmd="superscript"]',    history: '.etb-btn[data-cmd="superscript"]' },
    { id: 'subscript',      label: 'Subscript',         category: 'Formatting',  panel: '.tb[data-cmd="subscript"]',      history: '.etb-btn[data-cmd="subscript"]' },
    { id: 'textcolor',      label: 'Text Color',        category: 'Color',       panel: '#color-widget',                 history: '#ep-color-widget' },
    { id: 'highlight',      label: 'Highlight',         category: 'Color',       panel: '#hl-btn',                        history: '#ep-highlight-btn' },
    { id: 'clearformat',    label: 'Clear Formatting',  category: 'Formatting',  panel: '.tb[data-cmd="removeFormat"]',   history: '.etb-btn[data-cmd="removeFormat"]' },
    { id: 'bulletlist',     label: 'Bullet List',       category: 'Lists',       panel: '.tb[data-cmd="insertUnorderedList"]', history: '.etb-btn[data-cmd="insertUnorderedList"]' },
    { id: 'numberedlist',   label: 'Numbered List',     category: 'Lists',       panel: '.tb[data-cmd="insertOrderedList"]',   history: '.etb-btn[data-cmd="insertOrderedList"]' },
    { id: 'checklist',      label: 'Checklist',         category: 'Lists',       panel: '#checklist-btn',                 history: '#ep-checklist-btn' },
    { id: 'indent',         label: 'Indent',            category: 'Lists',       panel: '.tb[data-cmd="indent"]',         history: '.etb-btn[data-cmd="indent"]' },
    { id: 'outdent',        label: 'Outdent',           category: 'Lists',       panel: '.tb[data-cmd="outdent"]',        history: '.etb-btn[data-cmd="outdent"]' },
    { id: 'alignleft',      label: 'Align Left',        category: 'Alignment',   panel: '.tb[data-cmd="justifyLeft"]',    history: '.etb-btn[data-cmd="justifyLeft"]' },
    { id: 'aligncenter',    label: 'Align Center',      category: 'Alignment',   panel: '.tb[data-cmd="justifyCenter"]',  history: '.etb-btn[data-cmd="justifyCenter"]' },
    { id: 'alignright',     label: 'Align Right',       category: 'Alignment',   panel: '.tb[data-cmd="justifyRight"]',   history: '.etb-btn[data-cmd="justifyRight"]' },
    { id: 'link',           label: 'Insert Link',       category: 'Insert',      panel: '#link-btn',                      history: '#ep-link-btn' },
    { id: 'code',           label: 'Inline Code',       category: 'Insert',      panel: '#code-btn',                      history: '#ep-code-btn' },
    { id: 'math',           label: 'Math / LaTeX',      category: 'Insert',      panel: '#math-btn',                      history: '#ep-math-btn' },
    { id: 'table',          label: 'Insert Table',      category: 'Insert',      panel: '#table-btn',                     history: '#ep-table-btn' },
    { id: 'hr',             label: 'Divider',           category: 'Insert',      panel: '#hr-btn',                        history: '#ep-hr-btn' },
    { id: 'image',          label: 'Insert Image',      category: 'Insert',      panel: '#img-btn',                       history: '#ep-img-btn' },
  ];

  const DEFAULT_TOOL_SETTINGS = Object.fromEntries(TOOL_REGISTRY.map(t => [t.id, true]));

  async function getToolSettings() {
    const saved = await getSetting('toolbarTools', null);
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_TOOL_SETTINGS };
    return { ...DEFAULT_TOOL_SETTINGS, ...saved };
  }

  async function setToolEnabled(toolId, enabled) {
    const settings = await getToolSettings();
    settings[toolId] = enabled;
    await setSetting('toolbarTools', settings);
    return settings;
  }

  function getToolElement(tool, context) {
    const sel = context === 'panel' ? tool.panel : tool.history;
    if (!sel) return null;
    return document.querySelector(sel);
  }

  function getToolSeparatorBefore(el) {
    if (!el) return null;
    let prev = el.previousElementSibling;
    while (prev && prev.classList.contains('tb') === false && !prev.classList.contains('etb-btn') && prev.tagName !== 'SELECT' && !prev.classList.contains('tb-cc') && !prev.classList.contains('etb-color-wrap')) {
      if (prev.classList.contains('ts') || prev.classList.contains('etb-sep')) return prev;
      prev = prev.previousElementSibling;
    }
    return null;
  }

  async function applyToolbarVisibility(context) {
    const settings = await getToolSettings();
    const visibleIds = new Set();

    for (const tool of TOOL_REGISTRY) {
      const el = getToolElement(tool, context);
      if (!el) continue;
      const show = settings[tool.id] !== false;
      el.style.display = show ? '' : 'none';
      if (show) visibleIds.add(tool.id);
    }

    const sepClass = context === 'panel' ? '.ts' : '.etb-sep';
    document.querySelectorAll(sepClass).forEach(sep => {
      let next = sep.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains('ts') && !next.classList.contains('etb-sep')) {
        if (next.style.display !== 'none' && next.offsetParent !== null) {
          hasVisible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      let prev = sep.previousElementSibling;
      let hasVisibleBefore = false;
      while (prev && !prev.classList.contains('ts') && !prev.classList.contains('etb-sep')) {
        if (prev.style.display !== 'none' && prev.offsetParent !== null) {
          hasVisibleBefore = true;
          break;
        }
        prev = prev.previousElementSibling;
      }
      sep.style.display = (hasVisible && hasVisibleBefore) ? '' : 'none';
    });
  }

  function renderToolbarSettings(container, onChange) {
    const categories = [...new Set(TOOL_REGISTRY.map(t => t.category))];
    container.innerHTML = '';

    getToolSettings().then(settings => {
      categories.forEach(cat => {
        const section = document.createElement('div');
        section.className = 'tb-settings-cat';
        section.innerHTML = `<div class="tb-settings-cat-label">${cat}</div>`;
        const list = document.createElement('div');
        list.className = 'tb-settings-list';

        TOOL_REGISTRY.filter(t => t.category === cat).forEach(tool => {
          const label = document.createElement('label');
          label.className = 'tb-settings-item';
          const hasPanel = !!tool.panel;
          const hasHistory = !!tool.history;
          const scope = hasPanel && hasHistory ? '' : hasPanel ? ' (Panel)' : ' (History)';
          label.innerHTML = `<input type="checkbox" data-tool-id="${tool.id}" ${settings[tool.id] !== false ? 'checked' : ''}><span>${tool.label}${scope}</span>`;
          label.querySelector('input').addEventListener('change', async e => {
            await setToolEnabled(tool.id, e.target.checked);
            if (onChange) await onChange();
          });
          list.appendChild(label);
        });

        section.appendChild(list);
        container.appendChild(section);
      });
    });
  }

  function openModal(rootId, { title, bodyHtml, buttons }) {
    return new Promise(resolve => {
      const root = document.getElementById(rootId);
      if (!root) { resolve(null); return; }
      root.innerHTML = `<div class="modal-backdrop"><div class="modal-box"><h3>${title}</h3><div class="modal-body">${bodyHtml}</div><div class="modal-actions"></div></div></div>`;
      const actions = root.querySelector('.modal-actions');
      let done = false;
      const settle = v => { if (done) return; done = true; root.innerHTML = ''; resolve(v); };
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = b.cls || 'btn-s';
        btn.textContent = b.label;
        btn.addEventListener('click', () => settle(b.getValue ? b.getValue(root) : (b.value ?? null)));
        actions.appendChild(btn);
      });
      root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) settle(null); });
      root.addEventListener('keydown', e => { if (e.key === 'Escape') settle(null); });
      setTimeout(() => root.querySelector('textarea, input[type="text"], input[type="number"]')?.focus(), 40);
    });
  }

  function doConfirm(rootId, title, msg, ok = 'Confirm', cls = 'btn-d') {
    return openModal(rootId, {
      title,
      bodyHtml: `<p>${msg}</p>`,
      buttons: [{ label: 'Cancel', cls: 'btn-s', value: false }, { label: ok, cls, value: true }]
    });
  }

  function wrapInlineCode(editor, onChange) {
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType === 3) ancestor = ancestor.parentElement;
    const existingCode = ancestor?.closest?.('code');

    if (existingCode && editor.contains(existingCode)) {
      const text = document.createTextNode(existingCode.textContent);
      existingCode.parentNode.replaceChild(text, existingCode);
      const nr = document.createRange();
      nr.selectNodeContents(text);
      sel.removeAllRanges();
      sel.addRange(nr);
    } else {
      const text = sel.toString();
      if (!text) return;
      const code = document.createElement('code');
      try {
        range.surroundContents(code);
      } catch (_) {
        range.deleteContents();
        code.textContent = text;
        range.insertNode(code);
        range.setStartAfter(code);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    if (onChange) onChange();
  }

  async function insertMath(rootId, editor, onChange) {
    const selText = window.getSelection().toString().trim();
    const r = await openModal(rootId, {
      title: 'Insert Math Equation / LaTeX',
      bodyHtml: `
        <label class="field-label">Equation</label>
        <input type="text" id="math-eq" value="${esc(selText)}" placeholder="x^2 + y^2 = r^2,  \\frac{a}{b},  \\sqrt{2},  \\sum \\alpha \\leq \\beta">
        <label class="field-label">Display mode</label>
        <select id="math-mode" class="s-sel" style="width:100%;margin-top:4px">
          <option value="inline">Inline (within text)</option>
          <option value="block">Block (centered, own line)</option>
        </select>
        <p style="font-size:11px;color:var(--mu,var(--muted));margin-top:8px;line-height:1.5">Plain shorthand: <code>^</code> superscript, <code>_</code> subscript, <code>**bold**</code>.<br>LaTeX: <code>\\frac{a}{b}</code>, <code>\\sqrt{x}</code>, <code>\\alpha</code>, <code>\\sum</code>, <code>\\int</code>, <code>\\leq</code>, <code>\\infty</code>, <code>\\to</code>, etc. Unicode also works directly: ∑ ∫ π √ ∞ ≤ ≥</p>`,
      buttons: [{
        label: 'Cancel', cls: 'btn-s', value: null
      }, {
        label: 'Insert', cls: 'btn-p',
        getValue: root => ({
          eq: root.querySelector('#math-eq').value.trim(),
          mode: root.querySelector('#math-mode').value
        })
      }]
    });
    if (!r?.eq) return;
    editor.focus();
    const formatted = formatMathEquation(r.eq);
    const html = r.mode === 'block'
      ? `<div class="ssp-math-block" contenteditable="false">${formatted}</div><p><br></p>`
      : `<span class="ssp-math-inline" contenteditable="false">${formatted}</span>`;
    try { document.execCommand('insertHTML', false, html); } catch (_) {}
    if (onChange) onChange();
  }

  const LATEX_SYMBOLS = [
    [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\gamma/g, 'γ'], [/\\delta/g, 'δ'], [/\\epsilon/g, 'ε'],
    [/\\zeta/g, 'ζ'], [/\\eta/g, 'η'], [/\\theta/g, 'θ'], [/\\iota/g, 'ι'], [/\\kappa/g, 'κ'],
    [/\\lambda/g, 'λ'], [/\\mu/g, 'μ'], [/\\nu/g, 'ν'], [/\\xi/g, 'ξ'], [/\\pi/g, 'π'],
    [/\\rho/g, 'ρ'], [/\\sigma/g, 'σ'], [/\\tau/g, 'τ'], [/\\upsilon/g, 'υ'], [/\\phi/g, 'φ'],
    [/\\chi/g, 'χ'], [/\\psi/g, 'ψ'], [/\\omega/g, 'ω'],
    [/\\Gamma/g, 'Γ'], [/\\Delta/g, 'Δ'], [/\\Theta/g, 'Θ'], [/\\Lambda/g, 'Λ'], [/\\Xi/g, 'Ξ'],
    [/\\Pi/g, 'Π'], [/\\Sigma/g, 'Σ'], [/\\Phi/g, 'Φ'], [/\\Psi/g, 'Ψ'], [/\\Omega/g, 'Ω'],
    [/\\times/g, '×'], [/\\div/g, '÷'], [/\\cdot/g, '·'], [/\\pm/g, '±'], [/\\mp/g, '∓'],
    [/\\leq/g, '≤'], [/\\geq/g, '≥'], [/\\neq/g, '≠'], [/\\approx/g, '≈'], [/\\equiv/g, '≡'],
    [/\\infty/g, '∞'], [/\\sum/g, '∑'], [/\\prod/g, '∏'], [/\\int/g, '∫'], [/\\partial/g, '∂'],
    [/\\nabla/g, '∇'], [/\\to/g, '→'], [/\\rightarrow/g, '→'], [/\\leftarrow/g, '←'],
    [/\\Rightarrow/g, '⇒'], [/\\Leftarrow/g, '⇐'], [/\\forall/g, '∀'], [/\\exists/g, '∃'],
    [/\\in/g, '∈'], [/\\notin/g, '∉'], [/\\subset/g, '⊂'], [/\\cup/g, '∪'], [/\\cap/g, '∩'],
    [/\\emptyset/g, '∅'], [/\\therefore/g, '∴'], [/\\because/g, '∵'], [/\\propto/g, '∝'],
    [/\\perp/g, '⊥'], [/\\parallel/g, '∥'], [/\\angle/g, '∠'], [/\\degree/g, '°'],
    [/\\cdots/g, '⋯'], [/\\ldots/g, '…'], [/\\sqrt/g, '√']
  ];

  function formatMathEquation(eq) {
    let s = esc(eq);

    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="ssp-frac"><span class="ssp-frac-num">$1</span><span class="ssp-frac-den">$2</span></span>');

    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '<span class="ssp-sqrt"><span class="ssp-sqrt-sign">√</span><span class="ssp-sqrt-body">$1</span></span>');
    s = s.replace(/\\sqrt([a-zA-Z0-9])/g, '<span class="ssp-sqrt"><span class="ssp-sqrt-sign">√</span><span class="ssp-sqrt-body">$1</span></span>');

    s = s.replace(/\\text\{([^{}]*)\}/g, '$1');

    s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
    s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
    s = s.replace(/\^(\w+)/g, '<sup>$1</sup>');
    s = s.replace(/_(\w+)/g, '<sub>$1</sub>');

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    LATEX_SYMBOLS.forEach(([re, ch]) => { s = s.replace(re, ch); });

    s = s.replace(/\\([a-zA-Z]+)/g, '$1');
    return s;
  }

  function isBlockEl(node) {
    if (!node || node.nodeType !== 1) return false;
    if (/^(P|DIV|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|TD|TH)$/.test(node.tagName)) return true;
    try { return getComputedStyle(node).display === 'block'; } catch (_) { return false; }
  }

  function normalizeRangeForBlockCmd(editor) {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (range.endOffset !== 0) return;

    let endNode = range.endContainer;

    while (endNode && endNode !== editor && !isBlockEl(endNode)) {
      endNode = endNode.parentNode;
    }
    if (!endNode || endNode === editor) return;

    let prevBlock = endNode.previousSibling;
    while (prevBlock && prevBlock.nodeType !== 1) prevBlock = prevBlock.previousSibling;
    if (!prevBlock) return;

    if (endNode === range.startContainer || endNode.contains(range.startContainer)) return;

    const newRange = document.createRange();
    newRange.setStart(range.startContainer, range.startOffset);

    try {
      newRange.setEnd(prevBlock, prevBlock.childNodes.length);
    } catch (_) {
      newRange.setEndAfter(prevBlock);
    }
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function applyAlign(editor, cmd, onChange) {
    editor.focus();
    normalizeRangeForBlockCmd(editor);
    try { document.execCommand(cmd, false, null); } catch (_) {}
    if (onChange) onChange();
  }

  function applyFontSize(editor, px, onChange) {
    editor.focus();
    const sel = window.getSelection();
    const wasCollapsed = !sel.rangeCount || sel.getRangeAt(0).collapsed;
    try { document.execCommand('fontSize', false, '7'); } catch (_) {}
    const fonts = editor.querySelectorAll('font[size="7"]');
    let lastSpan = null;
    fonts.forEach(f => {
      const span = document.createElement('span');
      span.style.fontSize = px + 'px';
      while (f.firstChild) span.appendChild(f.firstChild);
      f.parentNode.replaceChild(span, f);
      lastSpan = span;
    });
    if (wasCollapsed && lastSpan) {

      if (!lastSpan.firstChild || (lastSpan.childNodes.length === 1 && lastSpan.firstChild.nodeType === 3 && lastSpan.firstChild.textContent === '\u200b')) {
        if (!lastSpan.firstChild) lastSpan.appendChild(document.createTextNode('\u200b'));
      }
      const r = document.createRange();
      r.setStart(lastSpan.firstChild, 0);
      r.setEnd(lastSpan.firstChild, lastSpan.firstChild.textContent.length);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    if (onChange) onChange();
  }

  function createFontSizeWidget({ editor, downId, upId, labelId, onChange, sizes, defaultPx }) {
    const SIZES = sizes || [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 48, 72];
    const downBtn = document.getElementById(downId);
    const upBtn = document.getElementById(upId);
    const label = document.getElementById(labelId);
    let px = defaultPx || 16;

    function stepIndex(dir) {
      if (dir < 0) {

        for (let i = SIZES.length - 1; i >= 0; i--) {
          if (SIZES[i] < px) return i;
        }
        return 0; 
      } else {

        for (let i = 0; i < SIZES.length; i++) {
          if (SIZES[i] > px) return i;
        }
        return SIZES.length - 1; 
      }
    }

    function setPx(newPx) {
      px = newPx;
      if (label) label.textContent = px + 'px';
    }
    function step(dir) {
      const i = stepIndex(dir);
      setPx(SIZES[i]);
      applyFontSize(editor, px, onChange);
    }
    if (downBtn) downBtn.addEventListener('click', () => step(-1));
    if (upBtn) upBtn.addEventListener('click', () => step(1));
    setPx(px);
    return { setPx, getPx: () => px };
  }

  function createHighlightTool({ editor, button, onChange }) {
    let paintMode = false;

    function setPaintMode(on) {
      paintMode = on;
      if (button) button.classList.toggle('ssp-paint-active', on);
    }

    function placeCaretAfter(node) {

      const textNode = document.createTextNode('\u200b');
      if (node.nextSibling) {
        node.parentNode.insertBefore(textNode, node.nextSibling);
      } else {
        node.parentNode.appendChild(textNode);
      }
      const r = document.createRange();
      r.setStart(textNode, 1); 
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }

    function wrapRangeAsHighlight(range) {
      let ancestor = range.commonAncestorContainer;
      if (ancestor.nodeType === 3) ancestor = ancestor.parentElement;
      const existingMark = ancestor && ancestor.closest ? ancestor.closest('mark.ssp-hl') : null;
      if (existingMark && editor.contains(existingMark) && range.toString() === existingMark.textContent) {
        const text = document.createTextNode(existingMark.textContent);
        existingMark.parentNode.replaceChild(text, existingMark);
        return text;
      }
      const mark = document.createElement('mark');
      mark.className = 'ssp-hl';
      try {
        range.surroundContents(mark);
      } catch (_) {
        const frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      }
      return mark;
    }

    function applyToCurrentSelection() {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return false;
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return false;
      const node = wrapRangeAsHighlight(range.cloneRange());
      if (node) placeCaretAfter(node);
      if (onChange) onChange();
      return true;
    }

    function toggle() {
      editor.focus();
      const sel = window.getSelection();
      const hasSelection = sel.rangeCount && !sel.isCollapsed && editor.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (hasSelection) {
        applyToCurrentSelection();
        setPaintMode(false);
      } else {
        setPaintMode(!paintMode);
      }
    }

    editor.addEventListener('mouseup', () => {
      if (!paintMode) return;
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        applyToCurrentSelection();
      }
    });
    document.addEventListener('keydown', e => { if (paintMode && e.key === 'Escape') setPaintMode(false); });

    if (button) button.addEventListener('mousedown', e => { e.preventDefault(); toggle(); });

    return { toggle, isPaintMode: () => paintMode, setPaintMode };
  }

  function createColorTool({ editor, buttonId, popoverId, customInputId, swatchSelector, onChange }) {
    const button = document.getElementById(buttonId);
    const popover = document.getElementById(popoverId);
    const customInput = customInputId ? document.getElementById(customInputId) : null;
    if (!button || !popover) return null;

    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}

    function setSwatchColor(hex) {
      const sw = button.querySelector(swatchSelector || '.color-current');
      if (sw) sw.style.background = hex;
    }

    function applyColor(hex) {
      editor.focus();
      try { document.execCommand('foreColor', false, hex); } catch (_) {}
      setSwatchColor(hex);
      if (onChange) onChange();
      closePopover();
    }

    function openPopover() { popover.classList.remove('hidden'); }
    function closePopover() { popover.classList.add('hidden'); }

    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', e => {
      e.stopPropagation();
      popover.classList.contains('hidden') ? openPopover() : closePopover();
    });

    popover.querySelectorAll('[data-color]').forEach(sw => {
      sw.style.background = sw.dataset.color;
      sw.addEventListener('mousedown', e => e.preventDefault());
      sw.addEventListener('click', e => { e.stopPropagation(); applyColor(sw.dataset.color); });
    });
    if (customInput) {
      customInput.addEventListener('input', () => applyColor(customInput.value));
      customInput.addEventListener('click', e => e.stopPropagation());
    }
    document.addEventListener('click', e => {
      if (!popover.classList.contains('hidden') && !popover.contains(e.target) && e.target !== button && !button.contains(e.target)) closePopover();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });

    return { applyColor, openPopover, closePopover };
  }

  async function insertLink(rootId, editor, onChange) {
    const selText = window.getSelection().toString().trim();
    const r = await openModal(rootId, {
      title: 'Insert Link',
      bodyHtml: `<label class="field-label">Text</label><input type="text" id="lk-t" value="${esc(selText)}" placeholder="Link text…"><label class="field-label">URL</label><input type="text" id="lk-u" placeholder="https://">`,
      buttons: [{ label: 'Cancel', cls: 'btn-s', value: null }, {
        label: 'Insert', cls: 'btn-p',
        getValue: root => ({ t: root.querySelector('#lk-t').value.trim(), u: root.querySelector('#lk-u').value.trim() })
      }]
    });
    if (!r?.u) return;
    editor.focus();
    if (selText) { try { document.execCommand('createLink', false, r.u); } catch (_) {} }
    else { try { document.execCommand('insertHTML', false, `<a href="${esc(r.u)}" target="_blank" rel="noopener">${esc(r.t || r.u)}</a>`); } catch (_) {} }
    if (onChange) onChange();
  }

  async function insertTable(rootId, editor, onChange) {
    const r = await openModal(rootId, {
      title: 'Insert Table',
      bodyHtml: `<div style="display:flex;gap:10px;align-items:center"><label class="field-label" style="margin:0">Rows</label><input type="number" id="tr" value="3" min="1" max="20" style="width:55px"><label class="field-label" style="margin:0">Cols</label><input type="number" id="tc" value="3" min="1" max="10" style="width:55px"></div>`,
      buttons: [{ label: 'Cancel', cls: 'btn-s', value: null }, {
        label: 'Insert', cls: 'btn-p',
        getValue: root => ({ rows: Math.max(1, +root.querySelector('#tr').value || 3), cols: Math.max(1, +root.querySelector('#tc').value || 3) })
      }]
    });
    if (!r) return;
    let h = '<table><thead><tr>' + Array(r.cols).fill(0).map((_, i) => `<th>H${i + 1}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 0; i < r.rows; i++) h += '<tr>' + Array(r.cols).fill('<td>&nbsp;</td>').join('') + '</tr>';
    h += '</tbody></table><p><br></p>';
    editor.focus();
    try { document.execCommand('insertHTML', false, h); } catch (_) {}
    if (onChange) onChange();
  }

  function selectionIsHighlighted(editor) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;
    let node = sel.focusNode;
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentElement;
    while (node && node !== editor) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg.includes('253') && bg.includes('230') && bg.includes('138')) return true;
      node = node.parentElement;
    }
    return false;
  }

  function toggleHighlight(editor, onChange) {
    editor.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    if (selectionIsHighlighted(editor)) {
      try { document.execCommand('hiliteColor', false, 'transparent'); } catch (_) {}
      try { document.execCommand('backColor', false, 'transparent'); } catch (_) {}
    } else {
      try { document.execCommand('hiliteColor', false, '#fde68a'); } catch (_) {}
    }
    if (onChange) onChange();
  }

  function createCropSystem({ modalId, canvasId, infoId, resetId, cancelId, applyId, onApply, showToast }) {
    const cropModal = document.getElementById(modalId);
    const cropCanvas = document.getElementById(canvasId);
    if (!cropModal || !cropCanvas) return null;

    const cropCtx = cropCanvas.getContext('2d');
    let cropImg = null, cropTarget = null, cropSel = null, cropStart = null;
    let cropDrawing = false, cropRafId = null;

    function toImgCoords(e) {
      const r = cropCanvas.getBoundingClientRect();
      const sx = cropCanvas.width / r.width;
      const sy = cropCanvas.height / r.height;
      return {
        x: (e.clientX - r.left) * sx,
        y: (e.clientY - r.top) * sy
      };
    }

    function normalizeRect(x1, y1, x2, y2) {
      let left = Math.min(x1, x2);
      let top = Math.min(y1, y2);
      let right = Math.max(x1, x2);
      let bottom = Math.max(y1, y2);
      left = Math.max(0, left);
      top = Math.max(0, top);
      right = Math.min(cropCanvas.width, right);
      bottom = Math.min(cropCanvas.height, bottom);
      return { x: left, y: top, w: right - left, h: bottom - top };
    }

    function drawCrop() {
      cropRafId = null;
      cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      if (cropImg) cropCtx.drawImage(cropImg, 0, 0, cropCanvas.width, cropCanvas.height);
      if (!cropSel || cropSel.w < 1 || cropSel.h < 1) return;

      const { x, y, w, h } = cropSel;
      cropCtx.save();
      cropCtx.fillStyle = 'rgba(0,0,0,0.55)';
      cropCtx.beginPath();
      cropCtx.rect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCtx.rect(x, y, w, h);
      cropCtx.fill('evenodd');
      cropCtx.restore();

      cropCtx.save();
      cropCtx.strokeStyle = '#5b6ef5';
      cropCtx.lineWidth = Math.max(1, cropCanvas.width / 500);
      cropCtx.setLineDash([6, 4]);
      cropCtx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      cropCtx.setLineDash([]);
      cropCtx.restore();

      const hs = Math.max(5, Math.min(12, cropCanvas.width / 70));
      cropCtx.fillStyle = '#5b6ef5';
      [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]].forEach(([cx, cy]) => cropCtx.fillRect(cx, cy, hs, hs));

      const lbl = `${Math.round(w)} × ${Math.round(h)}`;
      const fs = Math.max(10, Math.min(13, cropCanvas.width / 55));
      cropCtx.font = `bold ${fs}px monospace`;
      const tw = cropCtx.measureText(lbl).width + 10;
      const lx = Math.min(x, cropCanvas.width - tw - 4);
      const ly = y >= fs + 12 ? y - fs - 4 : y + h + fs + 4;
      cropCtx.fillStyle = 'rgba(8,10,20,0.85)';
      cropCtx.beginPath();
      if (cropCtx.roundRect) cropCtx.roundRect(lx, ly - fs, tw, fs + 6, 3);
      else cropCtx.rect(lx, ly - fs, tw, fs + 6);
      cropCtx.fill();
      cropCtx.fillStyle = '#fff';
      cropCtx.fillText(lbl, lx + 5, ly);
    }

    function scheduleCropDraw() { if (!cropRafId) cropRafId = requestAnimationFrame(drawCrop); }

    function closeCropModal() {
      cropModal.classList.add('hidden');
      cropImg = null;
      cropTarget = null;
      cropSel = null;
      cropStart = null;
      cropDrawing = false;
    }

    function openCropModal(imgEl) {
      cropTarget = imgEl;
      cropSel = null;
      cropStart = null;
      cropDrawing = false;

      const img = new Image();
      img.onload = () => {
        cropImg = img;
        const MAX = 1600;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX) { h = Math.round(h * (MAX / w)); w = MAX; }
        if (h > MAX) { w = Math.round(w * (MAX / h)); h = MAX; }
        cropCanvas.width = w;
        cropCanvas.height = h;
        cropCtx.clearRect(0, 0, w, h);
        cropCtx.drawImage(cropImg, 0, 0, w, h);
        cropModal.classList.remove('hidden');
        const info = document.getElementById(infoId);
        if (info) info.textContent = `${img.naturalWidth}×${img.naturalHeight} — drag to select area`;
      };
      img.onerror = () => { if (showToast) showToast('Cannot load image.', 'error'); };
      img.src = imgEl.src;
    }

    function applyCrop() {
      if (!cropSel || cropSel.w < 5 || cropSel.h < 5) {
        if (showToast) showToast('Draw a selection first.', 'error');
        return;
      }
      if (!cropImg || !cropTarget) return;

      const sx = cropImg.naturalWidth / cropCanvas.width;
      const sy = cropImg.naturalHeight / cropCanvas.height;
      const cx = Math.round(cropSel.x * sx);
      const cy = Math.round(cropSel.y * sy);
      const cw = Math.round(cropSel.w * sx);
      const ch = Math.round(cropSel.h * sy);
      if (cw < 2 || ch < 2) { if (showToast) showToast('Selection too small.', 'error'); return; }

      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d').drawImage(cropImg, cx, cy, cw, ch, 0, 0, cw, ch);
      cropTarget.src = out.toDataURL('image/png');
      closeCropModal();
      if (onApply) onApply(cw, ch);
    }

    function onPointerDown(e) {
      e.preventDefault();
      cropDrawing = true;
      cropCanvas.setPointerCapture(e.pointerId);
      const pt = toImgCoords(e);
      cropStart = { x: pt.x, y: pt.y };
      cropSel = { x: pt.x, y: pt.y, w: 0, h: 0 };
    }

    function onPointerMove(e) {
      if (!cropDrawing || !cropStart) return;
      const pt = toImgCoords(e);
      cropSel = normalizeRect(cropStart.x, cropStart.y, pt.x, pt.y);
      scheduleCropDraw();
      const info = document.getElementById(infoId);
      if (info) info.textContent = `Selected: ${Math.round(cropSel.w)}×${Math.round(cropSel.h)}`;
    }

    function onPointerUp(e) {
      if (!cropDrawing) return;
      cropDrawing = false;
      try { cropCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    cropCanvas.addEventListener('pointerdown', onPointerDown);
    cropCanvas.addEventListener('pointermove', onPointerMove);
    cropCanvas.addEventListener('pointerup', onPointerUp);
    cropCanvas.addEventListener('pointercancel', onPointerUp);

    document.getElementById(cancelId)?.addEventListener('click', closeCropModal);
    document.getElementById(resetId)?.addEventListener('click', () => {
      cropSel = null;
      cropStart = null;
      drawCrop();
      const info = document.getElementById(infoId);
      if (info) info.textContent = 'Draw a selection on the image';
    });
    document.getElementById(applyId)?.addEventListener('click', applyCrop);

    document.addEventListener('keydown', e => {
      if (cropModal.classList.contains('hidden')) return;
      if (e.key === 'Escape') closeCropModal();
      if (e.key === 'Enter') applyCrop();
    });

    return { openCropModal, closeCropModal };
  }

  function createImageManager({ editor, modalRootId, onChange, onSeek, showToast, cropSystem }) {
    function buildImageWrap(dataUrl, timeSec = null, pageUrl = null) {
      const wrap = document.createElement('div');
      wrap.className = 'ssp-img-wrap';
      wrap.contentEditable = 'false';

      if (timeSec !== null && pageUrl) {
        const chip = document.createElement('span');
        chip.className = 'ssp-ts';
        chip.dataset.time = timeSec;
        chip.textContent = `▶ ${formatTime(timeSec)}`;
        chip.title = 'Jump to this moment';
        chip.addEventListener('click', () => {
          if (onSeek) onSeek(timeSec);
          else chrome.runtime.sendMessage({ action: 'SEEK_VIDEO', time: timeSec });
        });
        wrap.appendChild(chip);
      }

      const img = document.createElement('img');
      img.src = dataUrl;
      img.draggable = false;
      img.style.maxWidth = '100%';

      const acts = document.createElement('div');
      acts.className = 'ssp-img-actions';

      const cropBtn = document.createElement('button');
      cropBtn.className = 'ssp-img-act';
      cropBtn.type = 'button';
      cropBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v4H2M18 22v-4h4M22 6h-4V2M2 18h4v4"/></svg> Crop';
      cropBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (cropSystem) cropSystem.openCropModal(img);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'ssp-img-act danger';
      delBtn.type = 'button';
      delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await doConfirm(modalRootId, 'Delete image?', 'Remove this image from your note?', 'Delete');
        if (ok) { wrap.remove(); if (onChange) onChange(); }
      });

      acts.append(cropBtn, delBtn);
      wrap.append(img, acts);
      return wrap;
    }

    function insertImage(dataUrl, timeSec = null, pageUrl = null) {
      const wrap = buildImageWrap(dataUrl, timeSec, pageUrl);
      const sel = window.getSelection();
      if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0);
        range.collapse(false);
        range.insertNode(wrap);
      } else {
        editor.appendChild(wrap);
      }
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      wrap.insertAdjacentElement('afterend', p);
      editor.scrollTop = editor.scrollHeight;
      if (onChange) onChange();
    }

    function hydrateImages() {
      editor.querySelectorAll('.ssp-img-wrap').forEach(wrap => {
        if (wrap.querySelector('.ssp-img-actions')) return;
        const img = wrap.querySelector('img');
        if (!img) return;
        const acts = document.createElement('div');
        acts.className = 'ssp-img-actions';
        const cropBtn = document.createElement('button');
        cropBtn.className = 'ssp-img-act';
        cropBtn.type = 'button';
        cropBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v4H2M18 22v-4h4M22 6h-4V2M2 18h4v4"/></svg> Crop';
        cropBtn.addEventListener('click', e => { e.stopPropagation(); if (cropSystem) cropSystem.openCropModal(img); });
        const delBtn = document.createElement('button');
        delBtn.className = 'ssp-img-act danger';
        delBtn.type = 'button';
        delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
        delBtn.addEventListener('click', async e => {
          e.stopPropagation();
          const ok = await doConfirm(modalRootId, 'Delete image?', 'Remove this image?', 'Delete');
          if (ok) { wrap.remove(); if (onChange) onChange(); }
        });
        acts.append(cropBtn, delBtn);
        wrap.appendChild(acts);
        wrap.contentEditable = 'false';
      });

      editor.querySelectorAll('img').forEach(img => {
        if (img.closest('.ssp-img-wrap')) return;
        const wrap = buildImageWrap(img.src);
        img.replaceWith(wrap);
      });
    }

    function readAndInsert(file) {
      if (!file?.type?.startsWith('image/')) {
        if (showToast) showToast('Not an image file.', 'error');
        return;
      }
      const r = new FileReader();
      r.onload = e => insertImage(e.target.result);
      r.readAsDataURL(file);
    }

    return { insertImage, hydrateImages, readAndInsert, buildImageWrap };
  }

  return {
    esc, formatTime,
    TOOL_REGISTRY, getToolSettings, setToolEnabled,
    applyToolbarVisibility, renderToolbarSettings,
    openModal, doConfirm,
    wrapInlineCode, insertMath, insertLink, insertTable,
    selectionIsHighlighted, toggleHighlight,
    createCropSystem, createImageManager, formatMathEquation,
    applyAlign, applyFontSize, createFontSizeWidget,
    createHighlightTool, createColorTool
  };
})();
