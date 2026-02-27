const guidanceMap = {
  medical: [
    'Check responsiveness and breathing immediately.',
    'Clear nearby hazards and keep airway open.',
    'Assign one person to call emergency services with exact location.',
  ],
  breakdown: [
    'Move vehicle and people away from active lanes if safe.',
    'Turn on hazard lights and set a visible warning marker.',
    'Request nearby assistance and tow support.',
  ],
  gas_leak: [
    'Do not use flames or electrical switches near leak area.',
    'Evacuate people upwind and increase ventilation if possible.',
    'Call emergency gas service and fire department immediately.',
  ],
  other: [
    'Prioritize immediate life safety and scene assessment.',
    'Share concise details with responders and dispatch.',
    'Track status updates every 1-2 minutes until stable.',
  ],
};

export async function getCrisisAssist(req, res) {
  const { crisisType = 'other', context = '' } = req.body;
  const steps = guidanceMap[crisisType] || guidanceMap.other;

  return res.json({
    crisisType,
    guidance: steps,
    summary: `Incident type: ${crisisType}. Context: ${context || 'No extra context provided.'}`,
    nextPrompt: 'After resolution, capture what worked and what gaps were observed.',
    source: 'local-fallback',
  });
}
