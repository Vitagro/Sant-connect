document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('appointment-calendar');
  const patient = document.getElementById('calendar-patient');
  const planner = document.getElementById('calendar-planner');
  const doctor = document.getElementById('calendar-doctor');
  const pickDate = document.getElementById('calendar-date');
  const planDate = document.getElementById('planner-date');
  const status = document.getElementById('calendar-status');
  const available = document.getElementById('calendar-available');
  const upcoming = document.getElementById('calendar-mine');
  const schedule = document.getElementById('calendar-schedule');
  const form = document.getElementById('calendar-range');
  const tz = 'Africa/Casablanca';
  const dayFormatter = new Intl.DateTimeFormat('fr', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const hour = new Intl.DateTimeFormat('fr-MA', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const fullDate = new Intl.DateTimeFormat('fr-MA', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const today = [parts.year, parts.month, parts.day].join('-');
  const maxDay = new Date(Date.parse(today) + 90 * 86400000).toISOString().slice(0, 10);
  for (const input of [pickDate, planDate]) {
    input.min = input.value = today;
    input.max = maxDay;
  }
  for (const [id, start, end, initial] of [['calendar-start', 14, 43, '09:00'], ['calendar-end', 15, 44, '12:00']]) {
    const select = document.getElementById(id);
    for (let n = start; n <= end; n++) {
      const time = String(Math.floor(n / 2)).padStart(2, '0') + (n % 2 ? ':30' : ':00');
      select.add(new Option(time, time));
    }
    select.value = initial;
  }

  const fetchCalendar = (path, options) => apiAuthFetch('/appointments' + path, options);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  function button(label, action) {
    const control = element('button', label);
    control.type = 'button';
    control.className = 'btn btn-outline';
    control.addEventListener('click', () => void action(control));
    return control;
  }

  let availabilityRead = 0;
  let scheduleRead = 0;
  let mutating = false;

  async function readAvailable() {
    const read = ++availabilityRead;
    const params = new URLSearchParams({ doctor: doctor.value, day: pickDate.value });
    available.replaceChildren();
    if (!doctor.value || !pickDate.value || !pickDate.validity.valid) {
      available.append(element('p', 'Choisissez un médecin et une date valide.'));
      return;
    }
    try {
      const slots = await fetchCalendar('/available?' + params);
      if (read !== availabilityRead) return;
      if (!slots.length) available.append(element('p', 'Aucun créneau disponible à cette date.'));
      for (const slot of slots) {
        const label = hour.format(new Date(slot.starts_at));
        available.append(button(label, async () => {
          if (!window.confirm('Réserver le ' + fullDate.format(new Date(slot.starts_at)) + ' ?')) return;
          await changePatient('/book/' + slot.id, 'Rendez-vous confirmé.');
        }));
      }
    } catch (err) {
      if (read === availabilityRead) status.textContent = err.message;
    }
  }

  async function readMine() {
    try {
      const slots = await fetchCalendar('/mine');
      upcoming.replaceChildren();
      if (!slots.length) upcoming.append(element('li', 'Aucun rendez-vous à venir.'));
      for (const slot of slots) {
        const item = element('li', slot.doctor_name + ' · ' + fullDate.format(new Date(slot.starts_at)));
        item.append(button('Annuler', async () => {
          if (!window.confirm('Annuler ce rendez-vous ?')) return;
          await changePatient('/cancel/' + slot.id, 'Rendez-vous annulé.');
        }));
        upcoming.append(item);
      }
    } catch (err) {
      status.textContent = err.message;
    }
  }

  async function changePatient(path, message) {
    if (mutating) return;
    mutating = true;
    try {
      await fetchCalendar(path, { method: 'POST' });
      status.textContent = message;
    } catch (err) {
      status.textContent = err.message;
    } finally {
      await Promise.all([readAvailable(), readMine()]);
      mutating = false;
    }
  }

  async function patientView() {
    const selected = doctor.value;
    try {
      const doctors = await fetchCalendar('/doctors');
      doctor.replaceChildren(new Option(doctors.length ? 'Sélectionner un médecin' : 'Aucun agenda publié', ''));
      for (const entry of doctors) doctor.add(new Option(entry.name, entry.id));
      if (doctors.some(entry => entry.id === selected)) doctor.value = selected;
      await Promise.all([readAvailable(), readMine()]);
    } catch (err) {
      status.textContent = err.message;
    }
  }

  async function readSchedule() {
    const read = ++scheduleRead;
    schedule.replaceChildren();
    if (!planDate.value || !planDate.validity.valid) return;
    try {
      const slots = await fetchCalendar('/schedule?' + new URLSearchParams({ day: planDate.value }));
      if (read !== scheduleRead) return;
      if (!slots.length) schedule.append(element('li', 'Aucun horaire publié ou bloqué pour cette journée.'));
      const states = { available: 'Disponible', blocked: 'Bloqué', booked: 'Réservé' };
      for (const slot of slots) {
        schedule.append(element('li', [hour.format(new Date(slot.starts_at)), states[slot.status], slot.patient_name].filter(Boolean).join(' · ')));
      }
    } catch (err) {
      if (read === scheduleRead) status.textContent = err.message;
    }
  }

  panel.addEventListener('toggle', () => {
    if (!panel.open) return;
    patient.hidden = currentUser?.role !== 'patient';
    planner.hidden = !['medecin', 'assistant', 'infirmier'].includes(currentUser?.role);
    if (!patient.hidden) void patientView();
    if (!planner.hidden) void readSchedule();
  });
  doctor.addEventListener('change', () => void readAvailable());
  pickDate.addEventListener('change', () => void readAvailable());
  planDate.addEventListener('change', () => void readSchedule());

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const control = form.querySelector('[type=submit]');
    control.disabled = true;
    try {
      const data = await fetchCalendar('/schedule', {
        method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      status.textContent = data.updated
        ? data.updated + ' créneau(x) mis à jour.'
        : 'Aucun créneau modifié. Vérifiez la plage et ses réservations.';
      await readSchedule();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      control.disabled = false;
    }
  });

  window.setInterval(() => {
    if (!panel.open || document.hidden || mutating) return;
    if (!patient.hidden && doctor.value) void readAvailable();
    if (!planner.hidden) void readSchedule();
  }, 30000);
});
