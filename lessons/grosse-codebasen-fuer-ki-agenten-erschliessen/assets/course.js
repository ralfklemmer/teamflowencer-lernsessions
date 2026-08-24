(function () {
  'use strict';

  var root = document.querySelector('[data-lesson-id]');
  if (!root) return;
  var lessonId = root.dataset.lessonId;
  var completionKey = 'serena-aider-pi-course-complete';

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }

  document.querySelectorAll('.quiz').forEach(function (quiz) {
    var feedback = quiz.querySelector('.quiz-feedback');
    quiz.querySelectorAll('.quiz-option').forEach(function (button) {
      button.addEventListener('click', function () {
        quiz.querySelectorAll('.quiz-option').forEach(function (other) {
          other.classList.remove('correct', 'wrong');
          other.disabled = false;
        });
        var correct = button.dataset.correct === 'true';
        button.classList.add(correct ? 'correct' : 'wrong');
        feedback.textContent = button.dataset.feedback || (correct ? 'Richtig.' : 'Noch einmal prüfen.');
        feedback.classList.add('show');
        feedback.setAttribute('role', 'status');
      });
    });
  });

  document.querySelectorAll('.checklist input[type="checkbox"]').forEach(function (box, index) {
    var key = 'serena-aider-pi-check-' + lessonId + '-' + index;
    box.checked = localStorage.getItem(key) === '1';
    box.addEventListener('change', function () {
      localStorage.setItem(key, box.checked ? '1' : '0');
    });
  });

  var completeButton = document.querySelector('.lesson-complete');
  if (completeButton) {
    var complete = readJson(completionKey, []);
    function render() {
      var done = complete.indexOf(lessonId) >= 0;
      completeButton.classList.toggle('done', done);
      completeButton.textContent = done ? '✓ Lesson abgeschlossen' : 'Lesson als abgeschlossen markieren';
      completeButton.setAttribute('aria-pressed', done ? 'true' : 'false');
    }
    completeButton.addEventListener('click', function () {
      var position = complete.indexOf(lessonId);
      if (position >= 0) complete.splice(position, 1);
      else complete.push(lessonId);
      localStorage.setItem(completionKey, JSON.stringify(complete));
      render();
    });
    render();
  }

  var progress = document.querySelector('.course-progress > span');
  if (progress) {
    var completed = readJson(completionKey, []);
    var total = Number(progress.parentElement.dataset.total || 7);
    var width = Math.min(100, Math.round((completed.length / total) * 100));
    progress.style.width = width + '%';
    progress.parentElement.setAttribute('aria-label', completed.length + ' von ' + total + ' Lessons abgeschlossen');
  }
})();
