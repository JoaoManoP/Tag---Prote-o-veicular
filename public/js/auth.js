'use strict';
const form = document.querySelector('form');
const errorBox = document.getElementById('formError');
const passwordToggle = document.getElementById('togglePassword');
function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); }
if (passwordToggle) passwordToggle.addEventListener('click', () => {
  const passwordInput = document.getElementById('password');
  const show = passwordInput.type === 'password';
  passwordInput.type = show ? 'text' : 'password';
  passwordToggle.setAttribute('aria-pressed', String(show));
  passwordToggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
});
document.querySelectorAll('[data-password-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
  const input = document.getElementById(toggle.dataset.passwordToggle);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
}));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  const button = form.querySelector('button[type="submit"]');
  const isRegister = form.id === 'registerForm';
  const password = document.getElementById('password').value;
  if (isRegister && password !== document.getElementById('confirmPassword').value) return showError('As senhas não coincidem.');
  const payload = isRegister ? { name: document.getElementById('name').value, email: document.getElementById('email').value, phone: document.getElementById('phone').value, password } : { email: document.getElementById('email').value, password };
  button.disabled = true;
  button.textContent = isRegister ? 'Criando conta…' : 'Entrando…';
  try {
    const response = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível continuar.');
    location.replace('/dashboard');
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = isRegister ? 'Criar conta e entrar' : 'Entrar';
  }
});
