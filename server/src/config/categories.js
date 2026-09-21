// The starting expense categories. They are copied into the database the first time the server runs;
// after that the admin manages them (Admin > Categories) and this list is never applied again.
// Empty array = a group with no items.
const DEFAULT_CATEGORIES = {
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

module.exports = { DEFAULT_CATEGORIES };
