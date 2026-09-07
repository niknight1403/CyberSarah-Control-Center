const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-navigation');

menuToggle?.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
});

navigation?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navigation.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Menü öffnen');
  });
});

const form = document.querySelector('#contact-form');
const status = document.querySelector('#form-status');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  const message = form.elements.message.value.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  status.classList.remove('is-visible', 'is-error');
  if (!name || !isEmailValid || message.length < 10) {
    status.textContent = 'Bitte prüfe deinen Namen, eine gültige E-Mail-Adresse und eine Nachricht mit mindestens 10 Zeichen.';
    status.classList.add('is-visible', 'is-error');
    return;
  }

  status.textContent = `Danke, ${name}! Deine Nachricht ist angekommen. Ich melde mich bald.`;
  status.classList.add('is-visible');
  form.reset();
});

document.querySelector('#current-year').textContent = new Date().getFullYear();