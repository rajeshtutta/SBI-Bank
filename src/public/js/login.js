(() => {
  const $ = id => document.getElementById(id);
  const user = $('customerId'), pwd = $('password'), cap = $('captcha'), btn = $('loginBtn');
  const canvas = $('captchaImg');
  const text = canvas.dataset.captcha || '';

  /* Draw the server-generated captcha (validated on the server against the session) */
  const c = canvas.getContext('2d');
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.font = 'bold 30px "Courier New", monospace'; c.textBaseline = 'middle';
  [...text].forEach((ch, i) => {
    c.save();
    c.translate(16 + i * 26, 48 + (Math.random() * 14 - 7));
    c.rotate((Math.random() - .5) * .5);
    c.fillStyle = '#111'; c.fillText(ch, 0, 0);
    c.restore();
  });
  c.strokeStyle = '#111'; c.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    c.beginPath(); c.moveTo(4, 30 + Math.random() * 36);
    c.lineTo(canvas.width - 4, 30 + Math.random() * 36); c.stroke();
  }

  /* Enable Login only when all fields are filled */
  const validate = () => { btn.disabled = !(user.value.trim() && pwd.value && cap.value.trim()); };
  [user, pwd, cap].forEach(el => el.addEventListener('input', validate));
  validate();

  /* Show / hide password */
  $('eye').addEventListener('click', e => {
    const show = pwd.type === 'password';
    pwd.type = show ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* Refresh = reload (GET /auth/login issues a new captcha) */
  $('refresh').addEventListener('click', () => location.reload());

  /* Audio captcha */
  $('speak').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.split('').join(' '));
    u.rate = .7; speechSynthesis.cancel(); speechSynthesis.speak(u);
  });

  /* A- / A / A+ */
  document.querySelectorAll('.fs button').forEach(b =>
    b.addEventListener('click', () => { document.body.dataset.textSize = b.dataset.size; }));
})();
