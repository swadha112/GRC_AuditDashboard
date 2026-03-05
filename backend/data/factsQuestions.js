// backend/data/factsQuestions.js
import { FACT_KEYS } from "./factsSchema.js";

export const QUESTION_BANK = {
  "org.country": {
    question: "Which country/jurisdiction is in scope for this ISO implementation?",
    why: "Affects legal/regulatory and privacy expectations.",
  },
  "org.industry": {
    question: "What industry/sector are you in, and what do you primarily do?",
    why: "Helps interpret risks and typical control applicability.",
  },
  "org.sites.hq_present": {
    question: "Is an HQ/central office included in scope? If yes, what key IT assets exist there?",
    why: "HQ assets drive multiple physical + technical controls.",
  },
  "org.sites.store_count": {
    question: "How many physical stores/branches/sites are in scope (approx)?",
    why: "Footprint impacts physical security and asset handling controls.",
  },
  "org.sites.ecommerce_present": {
    question: "Is there any online channel in scope (website/app/marketplace)? If yes, which?",
    why: "Online exposure changes monitoring and app security needs.",
  },
  "scope.in_scope_systems": {
    question: "List systems/assets IN SCOPE (POS, laptops, server, CRM, website, network devices, etc.).",
    why: "SoA depends heavily on what is actually in scope.",
  },
  "scope.out_of_scope_systems": {
    question: "List systems/assets OUT OF SCOPE (explicit exclusions), if any.",
    why: "Prevents over-applying controls to excluded environments.",
  },

  "data.customer_pii_present": {
    question: "Do you process/store customer personal data (PII) in scope? (Yes/No)",
    why: "Triggers privacy + protection requirements (27701 + many Annex A).",
  },
  "data.customer_pii_types": {
    question:
      "If customer PII exists, list categories (name/phone/email/address/order history/CCTV/location/IDs/etc.).",
    why: "Determines privacy impact and evidence expectations.",
  },
  "data.employee_pii_present": {
    question: "Do you process/store employee personal data in scope? (Yes/No) If yes, what categories?",
    why: "27701 includes employee PII too.",
  },
  "data.payment_processing_model": {
    question: "How are payments handled? (3rd-party gateway, POS provider, cash, bank transfer, etc.)",
    why: "Affects supplier risk and payment-related exposure.",
  },
  "data.card_data_stored": {
    question: "Do you store card numbers/sensitive card data anywhere in scope? (Yes/No/Unknown)",
    why: "Strongly impacts risk profile and required controls.",
  },

  "privacy.controller_or_processor": {
    question: "For customer PII, are you acting as PII Controller, Processor, or both? (best guess ok)",
    why: "27701 duties differ by controller vs processor role.",
  },
  "privacy.privacy_notice_exists": {
    question: "Do you have a customer privacy notice/policy? (Yes/No) Where is it published?",
    why: "Core 27701 transparency expectation.",
  },
  "privacy.dsr_process_exists": {
    question: "Do you have a process for Data Subject Requests (access/delete/correct)? (Yes/No/Planned)",
    why: "Key privacy operational requirement.",
  },
  "privacy.cross_border_transfers": {
    question: "Is any personal data transferred outside India (cloud region/SaaS vendor storage)? (Yes/No/Unknown)",
    why: "Cross-border transfers affect privacy controls and contracts.",
  },

  "people.staff_count_estimate": {
    question: "Approx headcount in scope (or range) and key teams (HQ IT, store staff, support)?",
    why: "Scale affects access admin, training, and ops controls.",
  },
  "people.shared_accounts_present": {
    question: "Are shared user accounts used anywhere (e.g., shared POS login)? (Yes/No) Where?",
    why: "Shared accounts reduce traceability and affect access controls.",
  },
  "devices.pos_terminals_present": {
    question: "Are POS terminals used in scope? (Yes/No) Are they locked down/managed?",
    why: "POS adds endpoint + physical risks.",
  },
  "devices.endpoint_management": {
    question: "How are endpoints managed (MDM/EDR/AV/patching)? Any baseline/hardening?",
    why: "Endpoint maturity affects technical control decisions.",
  },

  "access.remote_work_present": {
    question: "Is remote work allowed for any in-scope users? (Yes/No) How often?",
    why: "Remote access changes access and monitoring controls.",
  },
  "access.vpn_used": {
    question: "If remote access exists, do you use VPN/ZTNA? (Yes/No/Planned)",
    why: "Network access path affects control selection.",
  },
  "access.internet_exposed_services": {
    question: "Any internet-exposed services in scope (website/APIs/remote admin)? List them.",
    why: "Exposure drives additional monitoring/hardening needs.",
  },

  "tech.cloud_used": {
    question: "Do you use cloud infrastructure in scope (AWS/Azure/GCP)? (Yes/No) What workloads?",
    why: "Cloud usage changes control and supplier assumptions.",
  },
  "tech.saas_used": {
    question: "Do you use SaaS in scope (CRM, HR, email, ticketing)? List key SaaS + data handled.",
    why: "SaaS introduces third-party + privacy implications.",
  },

  "vendors.key_vendors": {
    question: "List key vendors/third parties in scope (logistics, payment gateway, MSP, SaaS providers).",
    why: "Supplier relationships affect many controls.",
  },
  "vendors.dpa_in_place": {
    question: "Do you have DPAs/contract clauses covering security + privacy with key vendors? (Yes/No/Partial)",
    why: "27701 + supplier controls often require contracts.",
  },

  "ops.logging_sources": {
    question: "What logs are collected (endpoints/servers/firewall/apps) and where stored (local/central)?",
    why: "Logging impacts detection and auditability.",
  },
  "ops.log_retention": {
    question: "How long are logs retained (days/months) and who reviews them?",
    why: "Retention/review affects monitoring and forensics.",
  },
  "ops.backups_present": {
    question: "Do you take backups of in-scope systems? (Yes/No) What is backed up?",
    why: "Backups are a common audit checkpoint.",
  },
  "ops.restore_testing": {
    question: "Do you test restores from backups? (Never/Occasionally/Quarterly/etc.)",
    why: "Restore tests prove resilience.",
  },
  "ops.incident_response_process": {
    question: "Do you have an incident response process (contacts/escalation/steps)? (Yes/No/Basic)",
    why: "IR maturity affects multiple controls.",
  },
  "ops.security_training": {
    question: "Do staff receive security awareness training? (Yes/No/Frequency)",
    why: "People controls are frequently audited.",
  },
  "ops.physical_security_basics": {
    question: "What basic physical controls exist (locks/CCTV/visitor log/restricted areas)?",
    why: "Physical domain depends on site controls.",
  },

  "dev.software_development_in_scope": {
    question: "Is any software development in scope? (Yes/No) If yes, what (web/app/scripts)?",
    why: "Dev scope triggers SDLC related controls.",
  },
  "dev.code_repo_used": {
    question: "If development exists, do you use a code repo (GitHub/GitLab/Bitbucket)? (Yes/No)",
    why: "Repo usage impacts access and change controls.",
  },
};

export function assertQuestionBankComplete() {
  const missing = FACT_KEYS.filter((k) => !QUESTION_BANK[k]);
  if (missing.length) {
    throw new Error(
      `QUESTION_BANK is missing questions for keys: ${missing.join(", ")}`
    );
  }
}
