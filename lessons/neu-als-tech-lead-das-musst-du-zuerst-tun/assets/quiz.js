/* Quiz-Widget v1 — wiederverwendbare Komponente für alle Lessons.
   Bindet alle .quiz-Blöcke: Klick auf .quiz-option → richtig/falsch markieren,
   .quiz-feedback einblenden, weitere Klicks sperren.
   Verwendung:
     <div class="quiz">
       <p class="quiz-prompt">Frage…</p>
       <div class="quiz-options">
         <button class="quiz-option" data-correct="1">Richtig</button>
         <button class="quiz-option">Falsch</button>
       </div>
       <div class="quiz-feedback">Erklärung…</div>
     </div>
   Setzt voraus: styles.css (Klassen .quiz, .quiz-option, .quiz-feedback).
*/
(function () {
  'use strict';

  document.querySelectorAll('.quiz').forEach(function (quiz) {
    var options = quiz.querySelectorAll('.quiz-option');
    var feedback = quiz.querySelector('.quiz-feedback');
    var explanation = feedback ? feedback.textContent.trim() : '';
    var answered = false;

    if (feedback) {
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.setAttribute('aria-atomic', 'true');
      feedback.setAttribute('tabindex', '-1');
    }

    options.forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        var isCorrect = opt.dataset.correct === '1';
        opt.classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect) {
          // die richtige Option zeigen, damit die Lücke sofort sichtbar wird
          options.forEach(function (o) {
            if (o.dataset.correct === '1') o.classList.add('correct');
          });
        }
        options.forEach(function (o) {
          o.disabled = true;
          if (o !== opt && o.dataset.correct !== '1') o.style.opacity = '0.55';
        });
        if (feedback) {
          feedback.textContent = (isCorrect ? 'Richtig. ' : 'Nicht richtig. ') + explanation;
          feedback.classList.add('show');
          feedback.focus();
        }
      });
    });
  });
})();
