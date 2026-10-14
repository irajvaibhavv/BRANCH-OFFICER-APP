// DSAs and connectors share one record shape (dsas.json); only `channel` tells them apart.
export const CHANNELS = { dsa: { label: 'DSA', plural: 'DSAs' }, connector: { label: 'Connector', plural: 'Connectors' } };
export const channelOf = (d) => d?.channel ?? 'dsa';
export const isConnector = (d) => channelOf(d) === 'connector';

// Clients split New / Existing / Lead. A DSA or connector the BO adds is a lead until empanelled; one empanelled in the
// last NEW_DAYS is new. A customer the BO adds (walk-in) is a lead; one whose loan is disbursed is existing.
export const CLIENT_STAGES = { new: 'New', existing: 'Existing', lead: 'Lead' };
const NEW_DAYS = 180;
export const partnerStage = (d, today = new Date()) => (d.stage === 'lead' ? 'lead'
  : d.empanelled && (today - new Date(d.empanelled)) / 86400000 <= NEW_DAYS ? 'new' : 'existing');
export const customerStage = (c) => (c.isNew ? 'lead' : c.stage === 'disbursed' ? 'existing' : 'new');
