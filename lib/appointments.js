const express = require('express');
const { supabase } = require('./supabase');
const { requireAuth, requireRole, isTeamRole } = require('./auth');

const router = express.Router();
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const halfHour = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
const columns = 'id, doctor_id, local_day, starts_at, status';
const validDay = value => typeof value === 'string' && date.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireAuth);
const patient = requireRole('patient');
const planner = requireRole('medecin', 'assistant', 'infirmier');
const doctorId = req => isTeamRole(req.user.role) ? req.user.teamOwnerId : req.user.sub;
const unavailable = res => res.status(503).json({ error: 'Le calendrier est momentanément indisponible.' });
const conflict = res => res.status(409).json({ error: 'Ce créneau n’est plus disponible. Le calendrier a été actualisé.' });

function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); } catch { unavailable(res); }
  };
}

router.get('/doctors', patient, route(async (req, res) => {
  const result = await supabase.rpc('calendar_doctors');
  if (result.error) return unavailable(res);
  return res.json(result.data);
}));

router.get('/available', patient, route(async (req, res) => {
  const { doctor, day } = req.query;
  if (typeof doctor !== 'string' || !uuid.test(doctor) || !validDay(day)) return res.status(400).json({ error: 'Date ou médecin invalide.' });
  const { data: owner, error: ownerError } = await supabase.from('users').select('id').eq('id', doctor)
    .eq('role', 'medecin').eq('is_active', true).maybeSingle();
  if (ownerError) return unavailable(res);
  if (!owner) return res.json([]);
  const result = await supabase.from('appointment_slots').select(columns).eq('doctor_id', doctor)
    .eq('local_day', day).eq('status', 'available').gt('starts_at', new Date().toISOString()).order('starts_at');
  if (result.error) return unavailable(res);
  return res.json(result.data);
}));

router.get('/mine', patient, route(async (req, res) => {
  const result = await supabase.from('appointment_slots')
    .select(columns + ',doctor:users!appointment_slots_doctor_id_fkey(nom,prenom,username)')
    .eq('patient_id', req.user.sub).eq('status', 'booked').gt('starts_at', new Date().toISOString()).order('starts_at');
  if (result.error) return unavailable(res);
  return res.json(result.data.map(({ doctor, ...slot }) => ({
    ...slot, doctor_name: [doctor?.prenom, doctor?.nom].filter(Boolean).join(' ') || doctor?.username || 'Médecin',
  })));
}));

router.post('/book/:id', patient, route(async (req, res) => {
  if (!uuid.test(req.params.id)) return res.status(400).json({ error: 'Créneau invalide.' });
  const result = await supabase.rpc('calendar_book', { p_slot: req.params.id, p_patient: req.user.sub });
  if (result.error) return unavailable(res);
  if (!result.data.length) return conflict(res);
  return res.status(201).json(result.data[0]);
}));

router.post('/cancel/:id', patient, route(async (req, res) => {
  if (!uuid.test(req.params.id)) return res.status(400).json({ error: 'Créneau invalide.' });
  const result = await supabase.from('appointment_slots').update({ status: 'available', patient_id: null })
    .eq('id', req.params.id).eq('patient_id', req.user.sub).eq('status', 'booked')
    .gt('starts_at', new Date().toISOString()).select('id').maybeSingle();
  if (result.error) return unavailable(res);
  if (!result.data) return res.status(404).json({ error: 'Rendez-vous introuvable ou passé.' });
  return res.json({ success: true });
}));

router.get('/schedule', planner, route(async (req, res) => {
  const { day } = req.query;
  if (!validDay(day)) return res.status(400).json({ error: 'Date invalide.' });
  const selection = req.user.role === 'medecin'
    ? columns + ',patient:users!appointment_slots_patient_id_fkey(nom,prenom,username)'
    : columns;
  const result = await supabase.from('appointment_slots').select(selection)
    .eq('doctor_id', doctorId(req)).eq('local_day', day).order('starts_at');
  if (result.error) return unavailable(res);
  return res.json(result.data.map(({ patient: account, ...slot }) => ({
    ...slot,
    ...(account ? { patient_name: [account.prenom, account.nom].filter(Boolean).join(' ') || account.username } : {}),
  })));
}));

router.put('/schedule', planner, route(async (req, res) => {
  const { day, start, end, status } = req.body || {};
  if (!validDay(day) || typeof start !== 'string' || typeof end !== 'string' ||
      !halfHour.test(start) || !halfHour.test(end) || start >= end ||
      !['available', 'blocked'].includes(status)) return res.status(400).json({ error: 'Plage horaire invalide.' });
  const result = await supabase.rpc('calendar_set_range', {
    p_doctor: doctorId(req), p_day: day, p_start: start, p_end: end, p_status: status,
  });
  if (result.error?.code === '22023') return res.status(400).json({ error: 'Choisissez une date dans les 90 prochains jours et des heures entre 07 h et 22 h.' });
  if (result.error) return unavailable(res);
  return res.json({ updated: result.data });
}));

module.exports = router;
