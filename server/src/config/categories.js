// Empty array = leaf group with no items.
const CATEGORIES = {
  Recurrent: {
    'Hospital Consumables': ['Oxygen', 'Toiletries & Stationeries', 'Laboratory Consumables', 'Theatre Consumables', 'Drugs', 'Others'],
    'Servicing & Maintenance': ['Electricity', 'Data & Airtime', 'Plumbing', 'Electrical', 'Fuel', 'Gas', 'Other T.P', 'Others'],
    'Outsource Services': ['Specialist Consultation', 'Laboratory', 'Opticals', 'Others'],
    'Staff Wages': [],
    'Tax and Dues': ['PAYE', 'WHT', 'Others'],
    Rents: [],
    Charity: [],
  },
  Capital: {
    Structural: ['Furniture', 'Electricals', 'Plumbing', 'Building'],
    Equipment: ['Nursing', 'Laboratory', 'Radiology', 'Theatre', 'Ophthalmology'],
  },
};

const listCategories = () =>
  Object.entries(CATEGORIES).map(([type, groups]) => ({
    type,
    groups: Object.entries(groups).map(([name, items]) => ({ name, items })),
  }));

function isValidCategory(type, group, item) {
  const groups = Object.hasOwn(CATEGORIES, type) ? CATEGORIES[type] : null;
  const items = groups && Object.hasOwn(groups, group) ? groups[group] : null;
  if (!items) return false;
  return items.length === 0 ? !item : items.includes(item);
}

module.exports = { CATEGORIES, listCategories, isValidCategory };
