(function () {
  'use strict';

  // Entscheidungsregel: Splash an, wenn ≥ 15 % mehr tok/s UND TTFT nicht schlechter.
  var MIN_GAIN = 1.15;

  function parseNumber(value) {
    // Akzeptiert Dezimalkomma (72,5) und Dezimalpunkt (72.5).
    var number = parseFloat(String(value).trim().replace(',', '.'));
    return isFinite(number) && number > 0 ? number : null;
  }

  function formatFactor(factor) {
    return factor.toFixed(2).replace('.', ',') + '×';
  }

  function decide(baseTps, splashTps, baseTtft, splashTtft) {
    var factor = splashTps / baseTps;
    var fastEnough = factor >= MIN_GAIN;
    var ttftOk = splashTtft <= baseTtft;
    if (fastEnough && ttftOk) {
      return { ok: true, text: 'Faktor ' + formatFactor(factor) + ': mindestens 15 % schneller und das erste Token kommt nicht später. Splash an.' };
    }
    if (fastEnough) {
      return { ok: false, text: 'Faktor ' + formatFactor(factor) + ': schneller, aber das erste Token kommt später. Miss noch zweimal nach, bevor du entscheidest.' };
    }
    return { ok: false, text: 'Faktor ' + formatFactor(factor) + ': weniger als 15 % Gewinn. Lass Splash für dieses Modell aus.' };
  }

  document.querySelectorAll('.decision-calc').forEach(function (calc) {
    var output = calc.querySelector('.decision-result');
    calc.querySelector('button').addEventListener('click', function () {
      var values = ['base-tps', 'splash-tps', 'base-ttft', 'splash-ttft'].map(function (name) {
        return parseNumber(calc.querySelector('[name="' + name + '"]').value);
      });
      if (values.some(function (v) { return v === null; })) {
        output.className = 'decision-result show';
        output.textContent = 'Bitte alle vier Felder mit Zahlen größer als 0 füllen.';
        return;
      }
      var result = decide(values[0], values[1], values[2], values[3]);
      output.className = 'decision-result show ' + (result.ok ? 'is-on' : 'is-off');
      output.textContent = result.text;
    });
  });
})();
