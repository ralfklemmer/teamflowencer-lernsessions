/* Annotations-Engine v3.2
   - Kein Gelb mehr (Konflikt mit Teach-Skill-Highlights)
   - Inline-Markierung: gepunktete Unterstreichung (Akzentfarbe)
   - Block-Markierung (ganze Absätze): vertikale Linie rechts (Gutter)
   - Cmd/Ctrl+Enter zum Speichern, Speichern = Default-Aktion (rechts)
   - Kommentare für den Agenten in die Zwischenablage kopieren
   - Alle Kommentare mit Sicherheitsabfrage löschen

   Verwendung: <script src="../assets/annotations.js"></script> am Ende des <body>.
   Setzt voraus: lesson-container mit Klasse .lesson und data-lesson-id.
*/

(function () {
  'use strict';

  // ─── Konfiguration ──────────────────────────────────────────────────
  var lesson = document.querySelector('.lesson');
  if (!lesson) return;
  var LESSON_ID = lesson.dataset.lessonId || location.pathname.split('/').pop().replace('.html', '');
  var WORKSPACE_ROOT = lesson.dataset.workspaceRoot || '../';
  var STORAGE_KEY = 'bmad-annotations-v1';

  // CSS laden
  var cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = WORKSPACE_ROOT + 'assets/annotations.css';
  document.head.appendChild(cssLink);

  function log(msg) { console.log('[annotations] ' + msg); }

  // ─── Storage ────────────────────────────────────────────────────────
  function loadAnnotations() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY + '-' + LESSON_ID);
      if (raw) return JSON.parse(raw);
    } catch (e) { log('Laden fehlgeschlagen: ' + e.message); }
    return [];
  }

  function saveAnnotations(anns) {
    try {
      localStorage.setItem(STORAGE_KEY + '-' + LESSON_ID, JSON.stringify(anns));
      return true;
    } catch (e) { log('Speichern fehlgeschlagen: ' + e.message); }
    return false;
  }

  // ─── State ──────────────────────────────────────────────────────────
  var annotations = [];
  var activeAnnotationId = null;

  // ─── Utilities ──────────────────────────────────────────────────────
  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getXPath(node) {
    if (!node || node.nodeType === 3) return node ? getXPath(node.parentNode) + '/text()' : '';
    if (node.id) return '//*[@id="' + node.id + '"]';
    if (node === document.body) return '/html/body';
    var parent = node.parentNode;
    if (!parent) return '';
    var siblings = Array.prototype.slice.call(parent.childNodes).filter(function (n) {
      return n.nodeType === 1;
    });
    var index = siblings.indexOf(node) + 1;
    return getXPath(parent) + '/' + node.tagName.toLowerCase() + '[' + index + ']';
  }

  function resolveXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch (e) { return null; }
  }

  function addAnnId(el, id) {
    var ids = el.dataset.annIds ? el.dataset.annIds.split(',') : [];
    if (ids.indexOf(id) < 0) ids.push(id);
    el.dataset.annIds = ids.join(',');
  }

  function removeAnnId(el, id) {
    var ids = el.dataset.annIds ? el.dataset.annIds.split(',') : [];
    ids = ids.filter(function (x) { return x !== id; });
    if (ids.length === 0) {
      el.classList.remove('ann-block', 'ann-active');
      delete el.dataset.annIds;
    } else {
      el.dataset.annIds = ids.join(',');
    }
  }

  // ─── Selektions-Analyse: Inline vs Block ────────────────────────────
  // Eine Selektion ist „block-level", wenn sie ganze Block-Elemente umfasst.
  // Heuristik: cloneContents () und prüfen, ob Block-Elemente enthalten sind.
  var BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, .callout, .diagram, table, ul, ol, div';

  function isBlockSelection(range) {
    try {
      var probe = range.cloneContents();
      return !!probe.querySelector(BLOCK_SELECTOR);
    } catch (e) { return false; }
  }

  // Finde alle „Leaf-Blöcke" (direkte Text-Container), die mit dem Range überlappen.
  // Leaf = keine weiteren Block-Kinder, damit wir nicht Container + Kind gleichzeitig markieren.
  var LEAF_BLOCK_SELECTOR = 'p, li, h2, h3, h4, h5, h6, blockquote, pre';

  function getOverlappingLeafBlocks(range) {
    var root = document.querySelector('.lesson');
    if (!root) return [];
    var blocks = [];
    root.querySelectorAll(LEAF_BLOCK_SELECTOR).forEach(function (el) {
      var r2 = document.createRange();
      r2.selectNodeContents(el);
      // Überlappung: weder „range endet vor Block" noch „range startet nach Block"
      var before = range.compareBoundaryPoints(Range.END_TO_START, r2) >= 0;
      var after = range.compareBoundaryPoints(Range.START_TO_END, r2) <= 0;
      if (!before && !after) blocks.push(el);
    });
    return blocks;
  }

  // ─── Wrapping: zwei Modi ────────────────────────────────────────────
  function wrapSelection(sel, annotation) {
    var range = sel.getRangeAt(0);
    if (range.collapsed) return null;

    var quote = sel.toString().trim();
    if (!quote) return null;
    annotation.quote = quote.slice(0, 300);

    if (isBlockSelection(range)) {
      var blocks = getOverlappingLeafBlocks(range);
      if (blocks.length > 0) {
        blocks.forEach(function (b) {
          b.classList.add('ann-block');
          addAnnId(b, annotation.id);
        });
        annotation.mode = 'block';
        annotation.xpaths = blocks.map(getXPath);
        return blocks[0];
      }
    }
    // Inline-Modus (Fallback oder per Default)
    return wrapInline(range, annotation);
  }

  function wrapInline(range, annotation) {
    var mark = document.createElement('mark');
    mark.className = 'ann-highlight';
    mark.dataset.id = annotation.id;
    try {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (e) {
      log('Inline-Wrap fehlgeschlagen: ' + e.message);
      return null;
    }
    annotation.mode = 'inline';
    annotation.xpath = getXPath(mark);
    return mark;
  }

  // ─── Highlight-Reapply (beim Laden) ─────────────────────────────────
  function reapplyHighlights() {
    annotations.forEach(function (ann) {
      if (ann.mode === 'block' && ann.xpaths) {
        ann.xpaths.forEach(function (xpath) {
          var node = resolveXPath(xpath);
          if (node) { node.classList.add('ann-block'); addAnnId(node, ann.id); }
        });
        return;
      }
      // Inline oder Legacy (v1-Format ohne mode)
      if (ann.xpath) {
        var node = resolveXPath(ann.xpath);
        if (node && node.tagName === 'MARK') {
          node.classList.add('ann-highlight');
          node.dataset.id = ann.id;
          if (!ann.mode) ann.mode = 'inline';
          return;
        }
      }
      // Fallback: Text-Suche nach Quote
      if (ann.quote) {
        var found = findRangeByQuote(ann.quote);
        if (found) {
          try {
            var m = document.createElement('mark');
            m.className = 'ann-highlight';
            m.dataset.id = ann.id;
            found.surroundContents(m);
            ann.xpath = getXPath(m);
            ann.mode = 'inline';
          } catch (e) {}
        }
      }
    });
  }

  function findRangeByQuote(quote) {
    var root = document.querySelector('.lesson');
    if (!root) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var idx = node.nodeValue.indexOf(quote);
      if (idx >= 0) {
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + quote.length);
        return range;
      }
    }
    return null;
  }

  // ─── Referenz-Element für eine Annotation finden ────────────────────
  function findRefEl(annotation) {
    if (annotation.mode === 'block' && annotation.xpaths && annotation.xpaths.length > 0) {
      return resolveXPath(annotation.xpaths[0]);
    }
    return document.querySelector('mark.ann-highlight[data-id="' + annotation.id + '"]');
  }

  // ─── UI: Floating Action Button ─────────────────────────────────────
  var fab = document.createElement('button');
  fab.className = 'ann-fab';
  fab.textContent = 'Kommentar';
  fab.addEventListener('click', onFabClick);
  document.body.appendChild(fab);

  function positionFab() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { fab.style.display = 'none'; return; }
    var rect = sel.getRangeAt(0).cloneRange().getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { fab.style.display = 'none'; return; }
    fab.style.display = 'block';
    fab.style.top = (window.scrollY + rect.top - 40) + 'px';
    fab.style.left = (window.scrollX + rect.left + rect.width / 2 - 50) + 'px';
  }

  document.addEventListener('selectionchange', function () {
    clearTimeout(window._annSelTimer);
    window._annSelTimer = setTimeout(positionFab, 50);
  });
  window.addEventListener('scroll', positionFab, { passive: true });
  window.addEventListener('resize', positionFab);

  function onFabClick() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var quote = sel.toString().trim();
    if (!quote) return;

    // Existierende Annotation mit gleicher Quote öffnen statt neu anlegen
    var existing = annotations.find(function (a) { return a.quote === quote; });
    if (existing) {
      openPopover(existing);
      sel.removeAllRanges();
      fab.style.display = 'none';
      return;
    }

    var annotation = {
      id: uid(),
      quote: quote,
      note: '',
      mode: null,
      createdAt: new Date().toISOString()
    };
    var refEl = wrapSelection(sel, annotation);
    if (!refEl) { sel.removeAllRanges(); fab.style.display = 'none'; return; }
    annotations.push(annotation);
    saveAnnotations(annotations);
    openPopover(annotation);
    sel.removeAllRanges();
    fab.style.display = 'none';
    updateStatus();
  }

  // ─── UI: Popover ────────────────────────────────────────────────────
  var popover = null;

  function openPopover(annotation) {
    closePopover();
    activeAnnotationId = annotation.id;

    clearActiveStates();
    var refEl = findRefEl(annotation);
    if (refEl) {
      refEl.classList.add('ann-active');
      refEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    var modeLabel = annotation.mode === 'block' ? 'Abschnitt' : 'Textstelle';
    popover = document.createElement('div');
    popover.className = 'ann-popover';
    popover.innerHTML =
      '<div class="ann-popover-head">' +
        '<div class="ann-popover-quote">' +
          '<span class="ann-popover-mode">' + modeLabel + '</span>' +
          '„' + escapeHtml(annotation.quote.slice(0, 120)) + (annotation.quote.length > 120 ? '…' : '') + '"' +
        '</div>' +
        '<button class="ann-popover-x" title="Schließen (Esc)">×</button>' +
      '</div>' +
      '<textarea class="ann-popover-input" placeholder="Kommentar oder Frage zu dieser Stelle…"></textarea>' +
      '<div class="ann-popover-hint">⌘/Ctrl + Enter zum Speichern</div>' +
      '<div class="ann-popover-actions">' +
        '<button class="ann-btn ann-btn-del" title="Kommentar löschen">Löschen</button>' +
        '<button class="ann-btn ann-btn-save" title="Speichern (⌘/Ctrl+Enter)">Speichern</button>' +
      '</div>';

    document.body.appendChild(popover);

    var input = popover.querySelector('.ann-popover-input');
    input.value = annotation.note || '';

    // Positionierung relativ zum Referenz-Element
    if (refEl) {
      var rect = refEl.getBoundingClientRect();
      var top = window.scrollY + rect.bottom + 8;
      var left = window.scrollX + rect.left;
      if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
      popover.style.top = top + 'px';
      popover.style.left = Math.max(10, left) + 'px';
    } else {
      popover.style.top = (window.scrollY + 100) + 'px';
      popover.style.left = '50%';
      popover.style.transform = 'translateX(-50%)';
    }

    input.focus();

    // ─── Speichern ──────────────────────────────────────────────────
    function doSave() {
      annotation.note = input.value.trim();
      annotation.updatedAt = new Date().toISOString();
      saveAnnotations(annotations);
      log('Kommentar gespeichert für ' + annotation.id);
      closePopover();
      updateStatus();
    }

    popover.querySelector('.ann-popover-x').addEventListener('click', closePopover);
    popover.querySelector('.ann-btn-save').addEventListener('click', doSave);

    // ⌘/Ctrl+Enter = Speichern (Default-Aktion)
    input.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doSave();
      }
    });

    // ─── Löschen ────────────────────────────────────────────────────
    popover.querySelector('.ann-btn-del').addEventListener('click', function () {
      if (!confirm('Diesen Kommentar wirklich löschen?')) return;
      annotations = annotations.filter(function (a) { return a.id !== annotation.id; });
      removeAnnotationFromDom(annotation);
      saveAnnotations(annotations);
      closePopover();
      updateStatus();
    });

    setTimeout(function () {
      document.addEventListener('mousedown', onOutsideClick);
    }, 100);
  }

  function removeAnnotationFromDom(annotation) {
    if (annotation.mode === 'block' && annotation.xpaths) {
      annotation.xpaths.forEach(function (xpath) {
        var node = resolveXPath(xpath);
        if (node) removeAnnId(node, annotation.id);
      });
    } else {
      var hl = document.querySelector('mark.ann-highlight[data-id="' + annotation.id + '"]');
      if (hl) {
        while (hl.firstChild) hl.parentNode.insertBefore(hl.firstChild, hl);
        hl.remove();
      }
    }
  }

  function clearActiveStates() {
    document.querySelectorAll('.ann-active').forEach(function (el) { el.classList.remove('ann-active'); });
  }

  function onOutsideClick(e) {
    if (popover && !popover.contains(e.target) && !e.target.classList.contains('ann-fab') && !e.target.classList.contains('ann-block') && !e.target.classList.contains('ann-highlight')) {
      closePopover();
    }
  }

  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
    document.removeEventListener('mousedown', onOutsideClick);
    activeAnnotationId = null;
    clearActiveStates();
  }

  // ─── Klick-Handling: Inline + Block ─────────────────────────────────
  document.addEventListener('click', function (e) {
    // Inline-Mark direkt getroffen
    if (e.target.classList && e.target.classList.contains('ann-highlight')) {
      var id = e.target.dataset.id;
      var ann = annotations.find(function (a) { return a.id === id; });
      if (ann) openPopover(ann);
      return;
    }
    // Block-Annotation (auch bei Klick auf Kind-Elemente innerhalb)
    var blockEl = e.target.closest ? e.target.closest('.ann-block') : null;
    if (blockEl) {
      var ids = blockEl.dataset.annIds ? blockEl.dataset.annIds.split(',') : [];
      if (ids.length === 1) {
        var ann2 = annotations.find(function (a) { return a.id === ids[0]; });
        if (ann2) openPopover(ann2);
      } else if (ids.length > 1) {
        // Mehrere Annotationen auf demselben Block → erste öffnen
        var first = annotations.find(function (a) { return a.id === ids[0]; });
        if (first) openPopover(first);
      }
    }
  });

  // ─── Status Bar ─────────────────────────────────────────────────────
  var status = document.createElement('div');
  status.className = 'ann-status';
  status.innerHTML =
    '<div class="ann-status-inner">' +
      '<span class="ann-status-dot" id="ann-dot"></span>' +
      '<span class="ann-status-text" id="ann-text">Lädt…</span>' +
      '<span class="ann-status-actions">' +
        '<button class="ann-btn" id="ann-copy" title="Alle Kommentare als JSON in die Zwischenablage kopieren">📋 Kopieren</button>' +
        '<button class="ann-btn ann-btn-clear-all" id="ann-clear-all" title="Alle Kommentare unwiderruflich löschen">Alle löschen</button>' +
        '<button class="ann-btn" id="ann-list" title="Alle Kommentare anzeigen">☰ <span id="ann-count">0</span></button>' +
      '</span>' +
    '</div>';
  document.body.appendChild(status);

  function updateStatus() {
    var count = annotations.length;
    document.getElementById('ann-count').textContent = count;
    document.getElementById('ann-clear-all').disabled = count === 0;
    document.getElementById('ann-dot').style.background = '#5a8a3a';
    document.getElementById('ann-text').textContent = count === 0
      ? 'Markiere Text, um ihn zu kommentieren'
      : count + ' Kommentar' + (count === 1 ? '' : 'e');
  }

  // ─── Kopieren-Button ────────────────────────────────────────────────
  document.getElementById('ann-copy').addEventListener('click', async function () {
    if (annotations.length === 0) {
      toast('Noch keine Kommentare zum Kopieren', '#c79a2a');
      return;
    }
    var sorted = annotations.slice().sort(function (a, b) {
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    var payload = {
      lesson: LESSON_ID,
      copiedAt: new Date().toISOString(),
      count: sorted.length,
      annotations: sorted.map(function (a, i) {
        return {
          n: i + 1,
          mode: a.mode || 'inline',
          quote: a.quote,
          note: a.note || ''
        };
      })
    };
    var json = JSON.stringify(payload, null, 2);
    var ok = false;
    try {
      await navigator.clipboard.writeText(json);
      ok = true;
    } catch (e) {
      ok = fallbackCopy(json);
    }
    if (ok) {
      toast(annotations.length + ' Kommentar' + (annotations.length === 1 ? '' : 'e') + ' kopiert – in den Agenten-Chat einfügen', '#5a8a3a');
    } else {
      prompt('Kopieren fehlgeschlagen – bitte manuell kopieren (Cmd+C):', json);
    }
  });

  // ─── Alle-löschen-Button ───────────────────────────────────────────
  document.getElementById('ann-clear-all').addEventListener('click', function () {
    var count = annotations.length;
    if (count === 0) return;

    var label = count === 1 ? 'Kommentar' : 'Kommentare';
    if (!confirm('Alle ' + count + ' ' + label + ' wirklich unwiderruflich löschen?')) return;

    annotations.slice().forEach(removeAnnotationFromDom);
    annotations = [];
    closePopover();
    try {
      localStorage.removeItem(STORAGE_KEY + '-' + LESSON_ID);
    } catch (e) {
      log('Löschen fehlgeschlagen: ' + e.message);
      saveAnnotations(annotations);
    }
    updateStatus();
    toast(count + ' ' + label + ' gelöscht', '#5a8a3a');
  });

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // ─── Toast ──────────────────────────────────────────────────────────
  function toast(message, color) {
    var t = document.createElement('div');
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:' + (color || '#5a8a3a') + ';color:white;padding:12px 20px;' +
      'border-radius:6px;font-family:-apple-system,sans-serif;font-size:14px;' +
      'z-index:10001;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:90vw;' +
      'text-align:center;opacity:0;transition:opacity 0.3s;';
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, 3500);
  }

  // ─── List-Overlay ───────────────────────────────────────────────────
  document.getElementById('ann-list').addEventListener('click', showList);

  function showList() {
    var overlay = document.createElement('div');
    overlay.className = 'ann-list';
    var sorted = annotations.slice().sort(function (a, b) {
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
    var items = sorted.length === 0
      ? '<div class="ann-list-empty">Noch keine Kommentare.<br><br>Markiere Text und klicke auf „Kommentar".</div>'
      : sorted.map(function (ann, i) {
          var modeBadge = ann.mode === 'block'
            ? '<span class="ann-mode-badge ann-mode-block">Abschnitt</span>'
            : '<span class="ann-mode-badge ann-mode-inline">Text</span>';
          return '<div class="ann-list-item" data-id="' + ann.id + '">' +
                   '<div class="ann-list-n">' + modeBadge + ' #' + (i + 1) + '</div>' +
                   '<div class="ann-list-quote">„' + escapeHtml(ann.quote.slice(0, 120)) + (ann.quote.length > 120 ? '…' : '') + '"</div>' +
                   (ann.note ? '<div class="ann-list-comment">' + escapeHtml(ann.note) + '</div>' : '<div class="ann-list-comment" style="color:#999;font-style:italic;">(noch kein Kommentar)</div>') +
                   '<div class="ann-list-meta">' + new Date(ann.createdAt).toLocaleString('de-DE') + '</div>' +
                 '</div>';
        }).join('');

    overlay.innerHTML =
      '<div class="ann-list-backdrop"></div>' +
      '<div class="ann-list-panel">' +
        '<div class="ann-list-head">' +
          '<h3>Kommentare · ' + sorted.length + '</h3>' +
          '<div>' +
            '<button class="ann-list-copy">📋 Kopieren</button>' +
            '<button class="ann-list-close">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="ann-list-items">' + items + '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.ann-list-backdrop').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('.ann-list-close').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('.ann-list-copy').addEventListener('click', function () { document.getElementById('ann-copy').click(); });
    overlay.querySelectorAll('.ann-list-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var id = item.dataset.id;
        var ann = annotations.find(function (a) { return a.id === id; });
        overlay.remove();
        if (ann) openPopover(ann);
      });
    });
  }

  // ─── Init ───────────────────────────────────────────────────────────
  function init() {
    annotations = loadAnnotations();
    reapplyHighlights();
    updateStatus();
    log('v3 initialisiert · ' + annotations.length + ' Kommentare');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closePopover();
      var list = document.querySelector('.ann-list');
      if (list) list.remove();
    }
  });

})();
