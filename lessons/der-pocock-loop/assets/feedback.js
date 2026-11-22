// Feedback button for a course page. Config comes from the including <script> tag:
// data-course (course slug) and data-endpoint (same-origin REST path).
// The station is the id of the visible <section class="lesson">.
(function () {
  'use strict';
  var me = document.currentScript;
  var COURSE = me.dataset.course;
  var ENDPOINT = me.dataset.endpoint;
  var MAX = 2000;
  var TIMEOUT_MS = 10000;
  var PRIVACY_URL = 'https://teamflowencer.de/datenschutzerklaerung/';

  var MARKUP =
    '<form class="fb-form" novalidate>' +
    '<h2 id="fb-title">Feedback zum Kurs</h2>' +
    '<p class="fb-station"></p>' +
    '<label for="fb-message">Was ist unklar, falsch oder fehlt?</label>' +
    '<textarea id="fb-message" name="message" maxlength="' + MAX + '" required></textarea>' +
    '<p class="fb-count" aria-live="off"></p>' +
    '<div class="fb-trap" aria-hidden="true"><label for="fb-website">Website</label>' +
    '<input id="fb-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
    '<p class="fb-note">Bitte keine personenbezogenen Daten. Dein Text wird gespeichert, um den Kurs zu verbessern. ' +
    '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">Datenschutzerklärung</a></p>' +
    '<p class="fb-status" role="status" aria-live="polite"></p>' +
    '<div class="fb-actions"><button type="button" class="fb-cancel">Schließen</button>' +
    '<button type="submit" class="fb-send">Senden</button></div>' +
    '</form>';

  function currentSection() {
    return document.querySelector('section.lesson:not([hidden])');
  }

  function init() {
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'fb-open';
    open.textContent = 'Feedback';
    open.setAttribute('aria-haspopup', 'dialog');

    var dialog = document.createElement('dialog');
    dialog.className = 'fb-dialog';
    dialog.setAttribute('aria-labelledby', 'fb-title');
    dialog.innerHTML = MARKUP;

    var form = dialog.querySelector('form');
    var text = dialog.querySelector('#fb-message');
    var trap = dialog.querySelector('#fb-website');
    var stationLine = dialog.querySelector('.fb-station');
    var count = dialog.querySelector('.fb-count');
    var status = dialog.querySelector('.fb-status');
    var send = dialog.querySelector('.fb-send');
    var station = '';

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = 'fb-status' + (kind ? ' ' + kind : '');
    }
    function updateCount() {
      count.textContent = text.value.length + ' / ' + MAX;
    }

    open.addEventListener('click', function () {
      var sec = currentSection();
      station = sec ? sec.id : '';
      var eyebrow = sec && sec.querySelector('.eyebrow');
      var title = sec && sec.querySelector('h2');
      stationLine.textContent = [eyebrow && eyebrow.textContent, title && title.textContent].filter(Boolean).join(': ');
      dialog.dataset.station = station;
      setStatus('', '');
      send.disabled = false;
      updateCount();
      dialog.showModal();
      text.focus();
    });
    dialog.querySelector('.fb-cancel').addEventListener('click', function () { dialog.close(); });
    // The course navigates with arrow keys on document; typing must not switch stations.
    dialog.addEventListener('keydown', function (e) { e.stopPropagation(); });
    text.addEventListener('input', updateCount);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var message = text.value.trim();
      if (message.length < 3) {
        setStatus('Bitte schreib mindestens drei Zeichen.', 'err');
        return;
      }
      send.disabled = true;
      setStatus('Wird gesendet …', '');
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : 0;
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ course: COURSE, station: station, message: message, website: trap.value }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) {
            text.value = '';
            updateCount();
            setStatus('Danke! Dein Feedback ist angekommen.', 'ok');
            return;
          }
          var fallback = res.status === 429
            ? 'Gerade kommen zu viele Nachrichten an. Bitte versuch es später noch einmal.'
            : 'Senden hat nicht geklappt. Bitte später noch einmal versuchen.';
          setStatus(typeof body.message === 'string' && body.message ? body.message : fallback, 'err');
          send.disabled = false;
        });
      }).catch(function () {
        setStatus('Senden hat nicht geklappt. Bitte später noch einmal versuchen.', 'err');
        send.disabled = false;
      }).then(function () { clearTimeout(timer); });
    });

    var bar = document.createElement('div');
    bar.className = 'fb-bar';
    bar.append(open);
    document.body.append(bar, dialog);
    document.body.classList.add('has-feedback');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
