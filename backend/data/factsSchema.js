// backend/data/factsSchema.js

// Facts we need (shared across ISO 27001:2022 + ISO/IEC 27701:2019 SoA logic)
// Keep keys stable. Add new keys here when you expand scope.

export const FACT_KEYS = [
  // Org / scope
  "org.country",
  "org.industry",
  "org.sites.hq_present",
  "org.sites.store_count",
  "org.sites.ecommerce_present",
  "scope.in_scope_systems",
  "scope.out_of_scope_systems",

  // Data / privacy
  "data.customer_pii_present",
  "data.customer_pii_types",
  "data.employee_pii_present",
  "data.payment_processing_model",
  "data.card_data_stored",
  "privacy.controller_or_processor",
  "privacy.privacy_notice_exists",
  "privacy.dsr_process_exists",
  "privacy.cross_border_transfers",

  // People/devices/access
  "people.staff_count_estimate",
  "people.shared_accounts_present",
  "devices.pos_terminals_present",
  "devices.endpoint_management",
  "access.remote_work_present",
  "access.vpn_used",
  "access.internet_exposed_services",

  // Cloud/vendors
  "tech.cloud_used",
  "tech.saas_used",
  "vendors.key_vendors",
  "vendors.dpa_in_place",

  // Ops security
  "ops.logging_sources",
  "ops.log_retention",
  "ops.backups_present",
  "ops.restore_testing",
  "ops.incident_response_process",
  "ops.security_training",
  "ops.physical_security_basics",

  // Dev
  "dev.software_development_in_scope",
  "dev.code_repo_used",
];

export function buildDefaultFacts() {
  // Use null for unknown so missing detection is easy.
  const facts = {};
  for (const k of FACT_KEYS) facts[k] = null;
  return facts;
}
