/**
 * Dev-only script: upload sample evidence files for Health Department SOA (id=4).
 * Creates a mix of detailed and inadequate documents across 12 controls.
 * Run from host: node backend/scripts/uploadSampleEvidence.mjs
 */

import fs from "fs";
import path from "path";
import os from "os";

const API = "http://localhost:5001";

// actionable_id → { filename, content, quality: "detailed" | "inadequate" }
const EVIDENCE = [
  // ── DETAILED ───────────────────────────────────────────────────────────────
  {
    id: 107, // A.5.1 – Information Security Policy
    filename: "IS_Policy_v2.1_2024.txt",
    quality: "detailed",
    content: `INFORMATION SECURITY POLICY
Version 2.1 | Effective Date: 01 March 2024 | Review Date: 01 March 2025
Owner: Chief Information Security Officer
Classification: Internal

1. PURPOSE
This policy establishes the organisation's commitment to protecting the confidentiality,
integrity and availability of all information assets in accordance with ISO/IEC 27001:2022.

2. SCOPE
Applies to all employees, contractors, agency staff, and third-party users with access to
Health Department systems, including the cloud-hosted Hospital Management System (HMS).

3. POLICY STATEMENTS
3.1 All information assets shall be classified according to the Information Classification
    Standard (Doc Ref: IS-CLASSIFY-001).
3.2 Access to HMS shall be granted on a least-privilege, role-based basis (RBAC).
    Access requests require line manager approval and IT sign-off.
3.3 Multi-factor authentication (MFA) is mandatory for all remote access and all
    privileged accounts.
3.4 Passwords must meet minimum complexity: 12 characters, upper/lower/number/symbol,
    90-day expiry, 10-generation history.
3.5 All security incidents must be reported to security@healthdept.gov within 2 hours
    of discovery using the Incident Reporting Form (IS-INC-001).
3.6 Backup of patient records, billing data, and lab results is performed nightly to
    an encrypted off-site location. Recovery is tested quarterly.
3.7 Staff must complete mandatory Information Security Awareness training annually.
    Completion records are retained for 3 years.
3.8 Removable media is prohibited on clinical workstations without prior IT approval.

4. RESPONSIBILITIES
- CISO: Policy ownership, annual review, exception management.
- IT Manager: Technical controls, access provisioning, incident response.
- Department Heads: Staff compliance, local asset register.
- All Staff: Adherence to this policy and reporting of suspected incidents.

5. ENFORCEMENT
Violations may result in disciplinary action up to and including dismissal and/or
referral to regulatory authorities (CQC, ICO).

6. RELATED DOCUMENTS
- IS-CLASSIFY-001: Information Classification Standard
- IS-ACCESS-002: Access Control Procedure
- IS-INC-001: Incident Response Procedure
- IS-BCM-003: Business Continuity Plan

Approved by: _________________________    Date: 01 March 2024
Director of Operations
`,
  },

  {
    id: 137, // A.5.34 – Privacy and PII
    filename: "Data_Privacy_Policy_v3.0.txt",
    quality: "detailed",
    content: `DATA PRIVACY AND PII PROTECTION POLICY
Version 3.0 | Effective Date: 15 January 2024 | Review Date: 15 January 2025
Owner: Data Protection Officer (DPO)
Classification: Internal

1. PURPOSE
To ensure all personal data, including special category health data (patient records,
diagnoses, prescriptions), is processed in compliance with UK GDPR and the Data
Protection Act 2018.

2. LAWFUL BASIS FOR PROCESSING
2.1 Patient care data: Article 9(2)(h) – necessary for medical diagnosis and treatment.
2.2 HR and payroll data: Article 6(1)(b) – necessary for performance of employment contract.
2.3 Supplier data: Article 6(1)(f) – legitimate interests.

3. DATA MINIMISATION AND RETENTION
Category              | Retention Period  | Disposal Method
----------------------|-------------------|------------------
Adult patient records | 8 years from last | Secure shred / encrypted wipe
                      | contact           |
Child patient records | Until age 25      | Secure shred / encrypted wipe
Prescriptions         | 2 years           | Encrypted wipe
Billing/Insurance     | 7 years           | Secure shred
HR Records            | 7 years post-exit | Encrypted wipe

4. SUBJECT ACCESS RIGHTS
Requests handled within 30 days. All requests logged in the SAR Register (DPO-SAR-001).
Identity verification mandatory before disclosure.

5. THIRD-PARTY PROCESSORS
All HMS vendor contracts include Data Processing Agreements (DPAs).
Annual review of DPAs required. Vendor sub-processors must be approved in advance.

6. BREACH NOTIFICATION
Any breach involving personal data must be escalated to the DPO within 24 hours.
Reportable breaches notified to the ICO within 72 hours per UK GDPR Article 33.

7. TRAINING
All staff with access to patient data complete GDPR awareness training on induction
and annually thereafter.

Approved by: _________________________    Date: 15 January 2024
Data Protection Officer
`,
  },

  {
    id: 132, // A.5.29 – Business Continuity
    filename: "Business_Continuity_Plan_v1.4.txt",
    quality: "detailed",
    content: `BUSINESS CONTINUITY PLAN – HEALTH DEPARTMENT
Version 1.4 | Effective Date: 10 February 2024 | Last Tested: 10 November 2023
Owner: Operations Director
Classification: Restricted

1. PURPOSE
To ensure continued delivery of critical health services in the event of a disruption to
the Hospital Management System (HMS), network, or physical premises.

2. CRITICAL SERVICES AND RTO/RPO
Service                   | RTO    | RPO    | Workaround
--------------------------|--------|--------|-------------------------------------------
Patient admissions/triage | 4 hrs  | 1 hr   | Paper-based admission forms (IS-BCM-F01)
Medication dispensing     | 2 hrs  | 30 min | Offline prescription pad + pharmacy log
Lab result reporting      | 8 hrs  | 2 hrs  | Manual fax to clinical team
Billing/insurance claims  | 48 hrs | 24 hrs | Batch entry on HMS restoration

3. ACTIVATION CRITERIA
BCP is activated by the IT Manager or Operations Director when:
- HMS unavailability exceeds 2 hours during clinical hours.
- Network outage affects > 50% of clinical workstations.
- Physical event (fire, flood) renders primary site inaccessible.

4. RECOVERY PROCEDURES
Step 1: IT Manager declares incident, notifies Operations Director and CISO.
Step 2: Failover to DR environment (cloud secondary region) initiated – target 2 hrs.
Step 3: Clinical leads notified; paper-based fallback activated per department SOPs.
Step 4: Status updates every 2 hours to Department Head.
Step 5: Post-incident review within 5 business days. Report to CISO.

5. BACKUP AND RECOVERY
- Nightly incremental backups to encrypted cloud secondary region (AWS eu-west-2).
- Weekly full backup. Monthly restore test.
- Backup test results reviewed by CISO monthly.

6. BCP TEST HISTORY
Date        | Type                | Result | Issues Found
------------|---------------------|--------|----------------------------------
10 Nov 2023 | Tabletop exercise   | Pass   | Minor: paper forms outdated in Ward 3
15 May 2023 | DR failover test    | Pass   | RTO achieved in 1h 48m
12 Jan 2023 | Backup restore test | Pass   | 100% data recovered

7. KEY CONTACTS
Role                  | Name              | Contact
----------------------|-------------------|------------------
Operations Director   | J. Matthews       | ext 2201
IT Manager            | R. Singh          | ext 2450 / mob 07xxx
CISO                  | L. Chen           | ext 2100
HMS Vendor Support    | CloudCare Ltd     | 0800-XXX-XXXX (24/7)

Approved by: _________________________    Date: 10 February 2024
Operations Director
`,
  },

  {
    id: 127, // A.5.24 – Incident Response
    filename: "Incident_Response_Plan_v2.0.txt",
    quality: "detailed",
    content: `INFORMATION SECURITY INCIDENT RESPONSE PLAN
Version 2.0 | Effective Date: 01 April 2024 | Review Date: 01 April 2025
Owner: CISO
Classification: Restricted

1. SCOPE
Covers all information security incidents affecting Health Department systems,
including the HMS, staff endpoints, network infrastructure, and data breaches.

2. INCIDENT CLASSIFICATION
Severity | Definition                                | SLA (Response)
---------|-------------------------------------------|----------------
P1       | Patient data breach, ransomware, HMS down | 30 minutes
P2       | Suspected breach, malware, privilege abuse | 2 hours
P3       | Policy violation, phishing click (no data) | 8 hours
P4       | Near-miss, anomalous access detected       | 24 hours

3. RESPONSE PHASES
Phase 1 – Identification
  - Staff report via email: security@healthdept.gov or ext 2100.
  - IT on-call acknowledges within SLA, opens ticket in ITSM.

Phase 2 – Containment
  - Isolate affected system from network if P1/P2.
  - Preserve evidence: do not power off unless ransomware confirmed.
  - Notify CISO and Operations Director within 30 mins for P1.

Phase 3 – Eradication & Recovery
  - Remove malware / revoke compromised credentials.
  - Restore from last known-good backup after forensic sign-off.
  - HMS vendor engaged for platform-level incidents (CloudCare SLA: 4hr response).

Phase 4 – Post-Incident Review
  - PIR completed within 5 business days (template: IS-INC-PIR-001).
  - Lessons learned shared with IT and clinical leads.
  - CISO reports trends quarterly to Board.

4. DATA BREACH NOTIFICATION
  - DPO notified within 24 hours of confirmed personal data breach.
  - ICO notification within 72 hours if risk to individuals (UK GDPR Art.33).
  - Affected individuals notified without undue delay if high risk (Art.34).

5. EVIDENCE PRESERVATION
  - System logs retained 12 months (login, admin actions, HMS audit trail).
  - Forensic images taken before remediation for P1/P2 incidents.
  - Chain of custody log maintained (IS-INC-COC-001).

Approved by: _________________________    Date: 01 April 2024
CISO
`,
  },

  {
    id: 122, // A.5.19 – Supplier Relationships
    filename: "Supplier_Register_2024.txt",
    quality: "detailed",
    content: `IT SUPPLIER AND CLOUD SERVICE REGISTER
Health Department | Version 1.2 | Review Date: January 2025
Owner: IT Manager
Classification: Internal

Supplier Name    | Service             | Data Processed           | Risk | DPA Signed | Last Review
-----------------|---------------------|--------------------------|------|------------|-------------
CloudCare Ltd    | HMS hosting (SaaS)  | Patient records, billing | High | Yes        | Mar 2024
MedBackup Ltd    | Offsite backup      | Patient records, HR data | High | Yes        | Jan 2024
SecureNet ISP    | Internet/WAN        | Network traffic metadata | Med  | Yes        | Jan 2024
CyberGuard Ltd   | Endpoint AV/EDR     | Device telemetry         | Med  | Yes        | Dec 2023
HR Cloud Ltd     | Payroll processing  | Staff PII, salary data   | High | Yes        | Feb 2024
TeleCom Ltd      | VOIP/telephony      | Call metadata only       | Low  | Yes        | Jan 2024
OfficeSoft       | Productivity suite  | Internal docs, emails    | Med  | Yes        | Mar 2024

REVIEW CRITERIA:
- High-risk suppliers reviewed annually with security questionnaire.
- DPA renewal triggered by contract renewal or data scope change.
- Sub-processor list reviewed semi-annually.

Next scheduled review: January 2025.
IT Manager sign-off: R. Singh _____________ Date: March 2024
`,
  },

  {
    id: 147, // A.6.7 – Remote Working
    filename: "Remote_Working_Policy_v1.2.txt",
    quality: "detailed",
    content: `REMOTE WORKING AND MOBILE DEVICE POLICY
Version 1.2 | Effective Date: 01 June 2023 | Review Date: 01 June 2024
Owner: IT Manager
Classification: Internal

1. SCOPE
Applies to all Health Department staff and contractors working remotely, including
clinical staff accessing HMS from off-site locations.

2. APPROVED DEVICES
2.1 Only IT-issued and managed devices are permitted to access HMS and clinical data remotely.
2.2 Personal devices are prohibited for accessing patient records or HMS.
2.3 All managed laptops must have: full-disk encryption (BitLocker), anti-virus (CyberGuard EDR),
    automatic screen lock (5-minute timeout), and remote-wipe capability.

3. NETWORK REQUIREMENTS
3.1 VPN is mandatory for all remote access to internal systems and HMS.
3.2 Public Wi-Fi networks must be used only over VPN. Split-tunnelling is disabled.
3.3 Home networks must use WPA2 or WPA3 encryption. IT provides setup guidance.

4. DATA HANDLING RULES
4.1 Patient data must not be downloaded to local storage. Access via HMS online only.
4.2 Screen sharing during video calls must not expose patient data without clinical necessity.
4.3 Physical printed patient documents are prohibited in home environments.
4.4 USB storage devices are blocked on managed endpoints.

5. MFA
MFA via Authenticator App is required for all remote HMS logins.
Backup codes stored securely by IT Manager only.

6. INCIDENT REPORTING
Lost/stolen devices: report to IT within 1 hour (ext 2450 / mob). Remote wipe initiated
immediately. Incident logged as P2.

7. COMPLIANCE MONITORING
IT reviews remote access logs monthly. Anomalous access patterns escalated to CISO.

Approved by: _________________________    Date: 01 June 2023
IT Manager
`,
  },

  // ── INADEQUATE ─────────────────────────────────────────────────────────────
  {
    id: 108, // A.5.2 – Security Roles & Responsibilities
    filename: "security_roles_draft.txt",
    quality: "inadequate",
    content: `Security Roles

IT is responsible for security.
Doctors and nurses should follow security rules.
Admins can create user accounts.

This document is a draft and not yet approved.
`,
  },

  {
    id: 134, // A.5.31 – Legal & Regulatory
    filename: "compliance_notes.txt",
    quality: "inadequate",
    content: `Compliance Register

We follow GDPR.
We also follow NHS guidelines.
Other regulations may apply.

TODO: check what else is required.
Last updated: unknown.
`,
  },

  {
    id: 142, // A.6.2 – Employment Terms
    filename: "contract_template_OLD.txt",
    quality: "inadequate",
    content: `Employee Contract Template

Name: ___________
Start Date: ___________
Role: ___________
Salary: ___________

The employee agrees to do their job.
Security rules should be followed.

Note: this is an old version. Current HR template is on the shared drive somewhere.
`,
  },

  {
    id: 158, // A.7.10 – Storage Media
    filename: "media_policy_stub.txt",
    quality: "inadequate",
    content: `Media Handling Policy

Don't lose USB drives.
Shred paper when done with it.
Ask IT if unsure.

(Needs more detail - assigning to IT Manager Q3)
`,
  },

  {
    id: 174, // A.8.10 – Information Deletion
    filename: "data_deletion_partial.txt",
    quality: "inadequate",
    content: `Data Deletion Notes

Old records should be deleted after some time.
IT will handle deletion of digital files.
Paper records go in the shredder bin.

Retention periods: TBD (waiting on legal confirmation).
`,
  },

  {
    id: 184, // A.8.20 – Network Security
    filename: "network_security_summary.txt",
    quality: "inadequate",
    content: `Network Security

We have a firewall.
VPN is used by remote workers.
The vendor manages the HMS network.

No further documentation available at this time.
`,
  },
];

async function uploadFile({ id, filename, content, quality }) {
  const tmpPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpPath, content, "utf8");

  try {
    const form = new FormData();
    const blob = new Blob([fs.readFileSync(tmpPath)], { type: "text/plain" });
    form.append("files", blob, filename);

    const res = await fetch(`${API}/api/soa-records/actionables/${id}/files`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || JSON.stringify(json));
    console.log(`  [${quality.toUpperCase().padEnd(10)}] Actionable ${id} → ${filename}  ✓`);
  } catch (err) {
    console.error(`  [FAILED     ] Actionable ${id} → ${filename}  ✗  ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

async function main() {
  console.log(`Uploading ${EVIDENCE.length} sample evidence files to Health Department SOA…\n`);
  const detailed = EVIDENCE.filter((e) => e.quality === "detailed");
  const inadequate = EVIDENCE.filter((e) => e.quality === "inadequate");
  console.log(`  Detailed   : ${detailed.length} files`);
  console.log(`  Inadequate : ${inadequate.length} files\n`);

  for (const ev of EVIDENCE) {
    await uploadFile(ev);
  }

  console.log("\nDone. Open the Health Department SoA in the UI to review evidence status.");
}

main().catch((e) => { console.error("Script failed:", e); process.exit(1); });
