/**
 * Company identity printed on payslips and other documents.
 *
 * Read from the environment so a deployment can set its own without a code
 * change. In a multi-tenant build this would come from the organisation
 * settings table described in docs/17-ui-customization.md.
 */
export const COMPANY = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Cadre',
  tagline: process.env.NEXT_PUBLIC_COMPANY_TAGLINE ?? 'People Operations',
  addressLine1: process.env.NEXT_PUBLIC_COMPANY_ADDRESS_1 ?? 'Plot 14, Shahrah-e-Faisal',
  addressLine2: process.env.NEXT_PUBLIC_COMPANY_ADDRESS_2 ?? 'Karachi 75400, Pakistan',
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? 'hr@cadrehrms.com',
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? '+92 21 3456 7890',
  registration: process.env.NEXT_PUBLIC_COMPANY_REG ?? '',
} as const;
