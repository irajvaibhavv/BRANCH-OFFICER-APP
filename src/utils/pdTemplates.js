// Stands in for an NBFC admin-portal feed: PD templates the BO can pick when triggering a remote PD.
// The borrower app decides which questions each template actually asks.
import templates from '../data/sarthi/pdTemplates.json';

export const PD_TEMPLATES = templates;
export const templateById = (id) => templates.find((t) => t.id === id);
