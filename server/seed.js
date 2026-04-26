const extraChallenges = [
  {
    title: "API-powered Analytics Dashboard",
    description: "Build a responsive analytics dashboard that displays transaction data fetched from an API, with filtering, sorting, and a chart summary.",
    rubric: { dimensions: ["data presentation", "responsiveness", "API usage", "filtering", "chart rendering"] },
    skill_targets: ["Dashboard Layout and Navigation", "API Integration", "Transaction or Financial Data Presentation", "Responsive UI Design"],
    required_outputs: ["GitHub URL", "Live URL", "Short explanation"]
  },
  {
    title: "E-commerce Checkout Flow",
    description: "Build a multi-step checkout flow with cart review, delivery details, payment form validation, and an order confirmation screen.",
    rubric: { dimensions: ["form validation", "multi-step UX", "error handling", "responsiveness", "confirmation state"] },
    skill_targets: ["Form Validation", "Form Handling", "Responsive UI Design", "Component Structure"],
    required_outputs: ["GitHub URL", "Live URL", "Short explanation"]
  },
  {
    title: "Mobile Wallet Onboarding UI",
    description: "Build a mobile-first wallet onboarding flow: welcome screen, KYC form, PIN setup, and a success screen. Must work on 360px screens.",
    rubric: { dimensions: ["mobile-first design", "form flow", "accessibility", "visual clarity", "state transitions"] },
    skill_targets: ["Responsive UI Design", "Form Handling", "Mobile-first Design", "Component Structure"],
    required_outputs: ["GitHub URL", "Short explanation", "Mobile screenshots"]
  },
  {
    title: "Node.js payment webhook service",
    description:
      "Build a small Node/Express service that ingests webhooks, validates signatures, writes events to a database, and exposes idempotent REST endpoints for payment status.",
    rubric: { dimensions: ["api design", "idempotency", "persistence", "error handling", "testing"] },
    skill_targets: ["Node.js Backend", "API Integration", "Database Integration", "Testing"],
    required_outputs: ["GitHub URL", "README with local run", "Short explanation"]
  },
  {
    title: "Component library with Storybook",
    description:
      "Ship a small UI kit (buttons, inputs, modal) documented in Storybook, with a11y-friendly defaults and a few component tests.",
    rubric: { dimensions: ["component API", "documentation", "accessibility", "testing", "consistency"] },
    skill_targets: ["Component Structure", "Responsive UI Design", "Testing", "Form Handling"],
    required_outputs: ["GitHub URL", "Storybook deploy or static build link", "Short explanation"]
  },
  {
    title: "Server-driven data grid",
    description:
      "Build a filterable, paginated table that loads rows from a REST API, supports sort, and covers loading, empty, and error states.",
    rubric: { dimensions: ["table UX", "API integration", "state handling", "accessibility", "performance"] },
    skill_targets: ["Dashboard UI", "API Integration", "Form Handling", "Responsive UI Design"],
    required_outputs: ["GitHub URL", "Live URL", "Short explanation"]
  },
  {
    title: "Content catalog and media detail",
    description:
      "Build a search/filter catalog (cards) with a detail view that can embed a video or media player. Mobile-first, keyboard accessible.",
    rubric: { dimensions: ["search/filter", "media embed", "responsiveness", "navigation", "a11y"] },
    skill_targets: ["Responsive UI Design", "Component Structure", "Mobile-first Design", "Form Handling"],
    required_outputs: ["GitHub URL", "Live URL", "Short explanation"]
  },
  {
    title: "DeFi / Crypto Token Dashboard",
    description:
      "Build a dashboard that connects to a blockchain or crypto API (CoinGecko, Etherscan, or a mock) and displays token balances, price data, and transaction history. Handle loading, empty, and error states. Works on mobile.",
    rubric: { dimensions: ["blockchain API integration", "data presentation", "responsiveness", "loading/error states", "transaction display"] },
    skill_targets: ["API Integration", "Dashboard UI", "Financial Data Presentation", "Responsive UI Design", "Data Visualization"],
    required_outputs: ["GitHub URL", "Live URL or recorded demo", "Short explanation"]
  },
  {
    title: "Crypto Wallet Send / Receive UI",
    description:
      "Build a mobile-first crypto wallet interface: address display, balance, send flow with amount validation, recipient address input, and a confirmation screen. Mock the blockchain calls.",
    rubric: { dimensions: ["wallet UX", "form validation", "mobile-first", "confirmation flow", "error handling"] },
    skill_targets: ["Checkout UI", "Form Validation", "Mobile-first Design", "API Integration", "Responsive UI Design"],
    required_outputs: ["GitHub URL", "Live URL or screenshots at 360px", "Short explanation"]
  },
  {
    title: "Smart Contract Interaction UI",
    description:
      "Build a frontend that connects to a smart contract (real or mock ABI) to read state, trigger transactions, and show events. Use ethers.js or web3.js. Display wallet connection status and handle chain errors.",
    rubric: { dimensions: ["web3 integration", "contract ABI usage", "error handling", "UI clarity", "wallet connection"] },
    skill_targets: ["API Integration", "Component Structure", "Node.js Backend", "Form Handling", "Deployment Literacy"],
    required_outputs: ["GitHub URL", "Live URL or demo video", "Short explanation"]
  },
  {
    title: "NFT / Token Explorer",
    description:
      "Build a search interface that fetches NFT or token metadata from a public blockchain API and displays it in a browsable, filterable list with detail view. Handle rate limits gracefully.",
    rubric: { dimensions: ["API integration", "search/filter UX", "data display", "loading states", "responsiveness"] },
    skill_targets: ["API Integration", "Dashboard UI", "Responsive UI Design", "Component Structure", "Data Visualization"],
    required_outputs: ["GitHub URL", "Live URL", "Short explanation"]
  }
];

const EXTRA_USERS = [
  {
    name: "Kwame Asante", email: "kwame@demo.unmapped", country: "Ghana", role: "talent",
    headline: "Backend API developer", bio: "I build REST APIs with Node.js and Express. Focused on fintech payment backends.",
    submission: {
      github: "https://github.com/kwame/payment-api", live: "https://kwame-payment-api.example.com",
      explanation: "Node.js REST API for a payment gateway. Express + Prisma + PostgreSQL. JWT auth, rate limiting, transaction logging, webhook delivery.",
      skills: [
        { name: "Node.js Backend", confidence: 0.93, evidence: "Express + Prisma stack, 12 commits, full CRUD endpoints", level: "advanced" },
        { name: "Database Integration", confidence: 0.90, evidence: "Prisma ORM with PostgreSQL schema and migrations", level: "intermediate" },
        { name: "API Integration", confidence: 0.82, evidence: "Webhook delivery with retry logic", level: "intermediate" }
      ],
      badges: [{ name: "Verified Node.js Backend", confidence: 0.93, proof: 88 }, { name: "Verified Database Integration", confidence: 0.90, proof: 85 }]
    }
  },
  {
    name: "Fatima Al-Rashid", email: "fatima@demo.unmapped", country: "Nigeria", role: "talent",
    headline: "Data visualization engineer", bio: "I build charts, dashboards, and financial data UIs with React and Recharts.",
    submission: {
      github: "https://github.com/fatima/fintech-dashboard", live: "https://fatima-fintech-dashboard.example.com",
      explanation: "Analytics dashboard for fintech transactions. React + Recharts, 15 commits. Live URL responds in 800ms. Has test files with Jest.",
      skills: [
        { name: "Data Visualization", confidence: 0.93, evidence: "Recharts in package.json, multiple chart components", level: "advanced" },
        { name: "Financial Data Presentation", confidence: 0.90, evidence: "Transaction list with filters, summary cards, totals row", level: "intermediate" },
        { name: "Dashboard UI", confidence: 0.88, evidence: "Sidebar navigation, analytics cards, responsive dashboard layout", level: "intermediate" },
        { name: "Responsive UI Design", confidence: 0.84, evidence: "Mobile layout verified via live URL", level: "intermediate" },
        { name: "Testing", confidence: 0.82, evidence: "Jest test files for chart and data components", level: "intermediate" }
      ],
      badges: [{ name: "Verified Data Visualization", confidence: 0.93, proof: 92 }, { name: "Verified Dashboard UI", confidence: 0.88, proof: 88 }]
    }
  },
  {
    name: "Carlos Mendez", email: "carlos@demo.unmapped", country: "Kenya", role: "talent",
    headline: "Full-stack developer", bio: "React frontend + Express backend. I deliver end-to-end product features.",
    submission: {
      github: "https://github.com/carlos/wallet-app", live: "https://carlos-wallet-app.example.com",
      explanation: "Mobile wallet onboarding + dashboard. React + Axios + Express backend. Form validation with Yup. TypeScript. 20 commits.",
      skills: [
        { name: "React", confidence: 0.92, evidence: "react + react-dom in package.json, 15 JSX components", level: "intermediate" },
        { name: "API Integration", confidence: 0.90, evidence: "Axios in package.json, custom API client with error handling", level: "intermediate" },
        { name: "Form Validation", confidence: 0.91, evidence: "Yup schema validation + react-hook-form", level: "advanced" },
        { name: "TypeScript", confidence: 0.88, evidence: "typescript in devDependencies, .ts files throughout", level: "intermediate" },
        { name: "Mobile-first Design", confidence: 0.82, evidence: "Mobile-first CSS, responsive across breakpoints", level: "intermediate" }
      ],
      badges: [{ name: "Verified React", confidence: 0.92, proof: 90 }, { name: "Verified Form Validation", confidence: 0.91, proof: 88 }, { name: "Verified TypeScript", confidence: 0.88, proof: 86 }]
    }
  },
  {
    name: "Amara Diallo", email: "amara@demo.unmapped", country: "Senegal", role: "talent",
    headline: "Mobile-first UI specialist", bio: "I build for mobile first. Accessible, fast, touch-friendly interfaces.",
    submission: {
      github: "https://github.com/amara/mobile-wallet-ui", live: "https://amara-wallet.example.com",
      explanation: "Mobile wallet onboarding: KYC form, PIN setup, confirmation screen. 360px-first. React. 8 commits. Accessible form states.",
      skills: [
        { name: "Mobile-first Design", confidence: 0.91, evidence: "360px viewport first, touch targets, CSS media queries", level: "advanced" },
        { name: "Form Handling", confidence: 0.87, evidence: "Multi-step onboarding form, PIN input, KYC fields", level: "intermediate" },
        { name: "Responsive UI Design", confidence: 0.84, evidence: "Verified responsive across mobile and tablet", level: "intermediate" },
        { name: "Component Structure", confidence: 0.78, evidence: "Reusable form steps and screen components", level: "intermediate" }
      ],
      badges: [{ name: "Verified Mobile-first Design", confidence: 0.91, proof: 88 }, { name: "Verified Form Handling", confidence: 0.87, proof: 84 }]
    }
  },
  {
    name: "Joseph Okonkwo", email: "joseph@demo.unmapped", country: "Nigeria", role: "talent",
    headline: "Junior frontend developer", bio: "Learning by building. 6 months of self-taught React and CSS.",
    submission: {
      github: "https://github.com/joseph/landing-page-v1", live: null,
      explanation: "Responsive landing page with a hero section and contact form. React. 3 commits. No live demo yet.",
      skills: [
        { name: "Responsive UI Design", confidence: 0.68, evidence: "Mobile CSS breakpoints, responsive hero section", level: "beginner" },
        { name: "Form Handling", confidence: 0.65, evidence: "Contact form with basic validation", level: "beginner" }
      ],
      badges: []
    }
  },
  {
    name: "Priya Nair", email: "priya@demo.unmapped", country: "Kenya", role: "talent",
    headline: "Checkout & payment UI engineer", bio: "Expert in payment flows, form validation, and multi-step UX for fintech.",
    submission: {
      github: "https://github.com/priya/checkout-flow", live: "https://priya-checkout.example.com",
      explanation: "Multi-step remittance checkout. React + react-hook-form + Yup. Amount validation, recipient fields, confirmation screen. 18 commits. All steps tested.",
      skills: [
        { name: "Checkout UI", confidence: 0.94, evidence: "Multi-step checkout flow with payment review and confirmation", level: "advanced" },
        { name: "Form Validation", confidence: 0.95, evidence: "react-hook-form + Yup, complex field rules, error states", level: "advanced" },
        { name: "Responsive UI Design", confidence: 0.86, evidence: "Live URL reachable, mobile-responsive checkout", level: "intermediate" },
        { name: "Testing", confidence: 0.83, evidence: "Test files for each checkout step", level: "intermediate" }
      ],
      badges: [{ name: "Verified Checkout UI", confidence: 0.94, proof: 92 }, { name: "Verified Form Validation", confidence: 0.95, proof: 93 }]
    }
  },
  {
    name: "Emmanuel Tetteh", email: "emmanuel@demo.unmapped", country: "Ghana", role: "talent",
    headline: "TypeScript frontend engineer", bio: "Production-quality React with TypeScript. Comprehensive test coverage. CI/CD pipelines.",
    submission: {
      github: "https://github.com/emmanuel/fintech-dashboard-ts", live: "https://emmanuel-fintech-ts.example.com",
      explanation: "Fintech dashboard with TypeScript, React Query, Recharts, and 90% test coverage. GitHub Actions CI. 25 commits. All API calls typed.",
      skills: [
        { name: "TypeScript", confidence: 0.96, evidence: "typescript in deps, strict mode, all files .tsx/.ts", level: "advanced" },
        { name: "Testing", confidence: 0.94, evidence: "Jest + Testing Library, CI pipeline, 90% coverage", level: "advanced" },
        { name: "Data Visualization", confidence: 0.92, evidence: "Recharts in package.json, multiple chart types", level: "advanced" },
        { name: "API Integration", confidence: 0.91, evidence: "React Query for typed API calls, loading and error states", level: "advanced" },
        { name: "Dashboard UI", confidence: 0.90, evidence: "Full dashboard layout with sidebar, cards, and charts", level: "advanced" }
      ],
      badges: [
        { name: "Verified TypeScript", confidence: 0.96, proof: 95 },
        { name: "Verified Testing", confidence: 0.94, proof: 93 },
        { name: "Verified Data Visualization", confidence: 0.92, proof: 90 },
        { name: "Verified API Integration", confidence: 0.91, proof: 89 }
      ]
    }
  }
];

export function seedExtraUsers(db) {
  const challengeRow = db.prepare("SELECT id FROM challenges ORDER BY id LIMIT 1").get();
  if (!challengeRow) return;
  const challengeId = challengeRow.id;

  for (const u of EXTRA_USERS) {
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(u.email)) continue;

    const uRow = db.prepare("INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)").run(u.name, u.email, u.country, u.role);
    const userId = Number(uRow.lastInsertRowid);

    db.prepare("INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)").run(
      userId, u.headline, u.country, u.bio, "[]", "open"
    );

    const sub = u.submission;
    const sRow = db.prepare(
      "INSERT INTO submissions (challenge_id, talent_id, project_description, github_url, live_url, explanation) VALUES (?,?,?,?,?,?)"
    ).run(challengeId, userId, sub.explanation, sub.github, sub.live, sub.explanation);
    const submissionId = Number(sRow.lastInsertRowid);

    db.prepare(
      "INSERT INTO evidence_analyses (submission_id, project_type, detected_features_json, file_structure_json, readme_signal, authenticity_risk, confidence_score, full_eval_json) VALUES (?,?,?,?,?,?,?,?)"
    ).run(submissionId, "web", "[]", "[]", "", "low", 82, "{}");

    for (const sk of sub.skills) {
      let skillRow = db.prepare("SELECT id FROM skills WHERE name = ?").get(sk.name);
      if (!skillRow) {
        const skId = db.prepare("INSERT INTO skills (name, category, ontology_source) VALUES (?,?,?)").run(sk.name, "General", "seed").lastInsertRowid;
        skillRow = { id: Number(skId) };
      }
      db.prepare(
        "INSERT INTO inferred_skills (talent_id, submission_id, skill_id, confidence, evidence_json, level, tier) VALUES (?,?,?,?,?,?,?)"
      ).run(userId, submissionId, skillRow.id, sk.confidence, JSON.stringify({ evidence: sk.evidence }), sk.level, "direct");
    }

    for (const b of sub.badges) {
      let badgeRow = db.prepare("SELECT id FROM badges WHERE name = ?").get(b.name);
      if (!badgeRow) {
        const bid = db.prepare("INSERT INTO badges (name, level, threshold_rules_json) VALUES (?,?,?)").run(b.name, "1", '{"dynamic":true}').lastInsertRowid;
        badgeRow = { id: Number(bid) };
      }
      try {
        db.prepare(
          "INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score, evaluator_source) VALUES (?,?,?,?,?,?)"
        ).run(userId, badgeRow.id, submissionId, b.confidence, b.proof, "seed");
      } catch {}
    }
  }
}

export function seedExtraChallenges(db) {
  for (const ch of extraChallenges) {
    const exists = db.prepare("SELECT id FROM challenges WHERE title = ?").get(ch.title);
    if (exists) continue;
    db.prepare(
      `INSERT INTO challenges (title, description, rubric_json, required_outputs, skill_targets) VALUES (?,?,?,?,?)`
    ).run(
      ch.title,
      ch.description,
      JSON.stringify(ch.rubric),
      JSON.stringify(ch.required_outputs),
      JSON.stringify(ch.skill_targets)
    );
  }
}

function demoJobParsed(roleTitle, required, nice = []) {
  return {
    role_title: roleTitle,
    required_skills: required,
    nice_to_have_skills: nice,
    deliverables: ["Ship with tests and docs", "Meaningful code review coverage"],
    test_challenge: "Time-boxed vertical slice with demo and repo link.",
    matching_weights: { skills: 0.45, experience: 0.25, proof: 0.3 },
    source: "seed",
    model: "seed"
  };
}

const DEMO_EMPLOYER_JOBS = [
  {
    raw: "Senior frontend for our banking dashboard. React, TypeScript, data viz with charts, must handle money movement UI and accessibility.",
    parsed: demoJobParsed("Senior Frontend — Banking Dashboard", [
      "React",
      "TypeScript",
      "Data Visualization",
      "API Integration",
      "Responsive UI Design"
    ], ["Testing", "Dashboard UI"])
  },
  {
    raw: "Backend engineer: Node, PostgreSQL, REST and webhooks, strong security awareness for fintech transactions.",
    parsed: demoJobParsed("Backend Engineer — Fintech", [
      "Node.js Backend",
      "Database Integration",
      "API Integration",
      "Testing"
    ], ["TypeScript", "Form Handling"])
  },
  {
    raw: "Product engineer who can own end-to-end checkout and payments UX; forms, validation, error states, mobile first.",
    parsed: demoJobParsed("Product Engineer — Checkout", [
      "Form Validation",
      "Form Handling",
      "Mobile-first Design",
      "API Integration"
    ], ["React", "Component Structure"])
  },
  {
    raw: "Data analyst with frontend chops: build internal analytics views, work with our API team, charts and tables at scale.",
    parsed: demoJobParsed("Analytics UI Engineer", [
      "Dashboard UI",
      "Data Visualization",
      "API Integration",
      "Financial Data Presentation"
    ], ["Responsive UI Design", "TypeScript"])
  },
  {
    raw: "Design systems engineer: Storybook, reusable components, a11y, coordinate with product design.",
    parsed: demoJobParsed("Design Systems / UI Platform", [
      "Component Structure",
      "Testing",
      "Responsive UI Design"
    ], ["TypeScript", "React", "Form Handling"])
  },
  {
    raw: "Mobile-first app developer for our wallet; onboarding flows, KYC-style forms, PIN flows, 360px layouts.",
    parsed: demoJobParsed("Mobile Wallet / Onboarding", [
      "Mobile-first Design",
      "Form Handling",
      "Responsive UI Design"
    ], ["Form Validation", "Component Structure", "API Integration"])
  }
];

/**
 * Add several demo job postings so talent can browse a realistic market (idempotent when enough jobs exist).
 */
export function seedDemoJobs(db) {
  const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  if (!company) return;
  const { c: jobCount } = db.prepare("SELECT COUNT(*) as c FROM jobs").get();
  if (jobCount >= 5) return;
  const ins = db.prepare("INSERT INTO jobs (company_id, raw_description, parsed_job_json) VALUES (?,?,?)");
  for (const job of DEMO_EMPLOYER_JOBS) {
    const exists = db.prepare("SELECT id FROM jobs WHERE company_id = ? AND raw_description = ?").get(company.id, job.raw);
    if (exists) continue;
    ins.run(company.id, job.raw, JSON.stringify(job.parsed));
  }
}

/**
 * Idempotent seed: only runs when `users` is empty.
 */
export function seedDatabase(db) {
  const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get();
  if (c > 0) return;

  const ins = (sql) => db.prepare(sql);

  const run = db.transaction(() => {
    ins(
      `INSERT INTO users (name, email, country, role) VALUES (?, ?, ?, ?)`
    ).run("Amina Okoro", "amina@demo.unmapped", "Nigeria", "talent");
    ins(`INSERT INTO users (name, email, country, role) VALUES (?, ?, ?, ?)`).run(
      "Kofi Mensah",
      "kofi@demo.unmapped",
      "Ghana",
      "talent"
    );
    ins(`INSERT INTO users (name, email, country, role) VALUES (?, ?, ?, ?)`).run(
      "Nadia Kamau",
      "nadia@demo.unmapped",
      "Kenya",
      "talent"
    );
    ins(`INSERT INTO users (name, email, country, role) VALUES (?, ?, ?, ?)`).run(
      "Demo Employer",
      "hr@demo.unmapped",
      "United States",
      "company"
    );

    const talent1 = 1;
    const talent2 = 2;
    const talent3 = 3;
    const companyUser = 4;

    ins(
      `INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`
    ).run(talent1, "Frontend developer", "Nigeria", "Proof-of-work builder", '["https://github.com/demo"]', "open");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(talent2, "Dashboard engineer", "Ghana", "Data + UI", "[]", "open");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(talent3, "Product UI", "Kenya", "Forms and checkout", "[]", "open");

    const companyRow = ins(
      `INSERT INTO companies (user_id, company_name, industry, country) VALUES (?,?,?,?)`
    ).run(companyUser, "Demo Fintech Ltd", "Fintech", "United States");

    const challengeRubric = JSON.stringify({
      dimensions: ["functionality", "responsiveness", "evidence_quality", "API usage", "UI clarity"]
    });
    const skillTargets = JSON.stringify([
      "Responsive UI Design",
      "API Integration",
      "Form Handling",
      "Component Structure",
      "Mobile-first Design"
    ]);
    const requiredOut = JSON.stringify(["GitHub URL", "Live URL", "Short explanation"]);

    ins(
      `INSERT INTO challenges (title, description, rubric_json, required_outputs, skill_targets) VALUES (?,?,?,?,?)`
    ).run(
      "Fintech landing page proof",
      "Build a responsive fintech landing page with API integration and a validated contact form.",
      challengeRubric,
      requiredOut,
      skillTargets
    );

    const challengeId = db.prepare("SELECT last_insert_rowid() as id").get().id;

    const skillNames = [
      ["Responsive UI Design", "UI/Frontend", "Layout and responsive patterns", "unmapped_v1"],
      ["API Integration", "Backend/API", "HTTP data integration", "unmapped_v1"],
      ["Form Handling", "UI/Frontend", "Validation and submission flows", "unmapped_v1"],
      ["Component Structure", "System Design", "Reusable UI organization", "unmapped_v1"],
      ["Deployment Literacy", "System Design", "Shipping and hosting awareness", "unmapped_v1"],
      ["Dashboard Layout and Navigation", "UI/Frontend", "Navigation and IA for dashboards", "unmapped_v1"],
      [
        "Transaction or Financial Data Presentation",
        "Data Handling",
        "Financial data in UI",
        "unmapped_v1"
      ],
      ["Form Validation", "UI/Frontend", "Input validation UX", "unmapped_v1"]
    ];

    const skillIds = {};
    for (const [name, cat, desc, ont] of skillNames) {
      const r = ins(`INSERT INTO skills (name, category, description, ontology_source) VALUES (?,?,?,?)`).run(
        name,
        cat,
        desc,
        ont
      );
      skillIds[name] = Number(r.lastInsertRowid);
    }

    for (const [name, sid] of Object.entries(skillIds)) {
      ins(
        `INSERT INTO badges (name, skill_id, level, threshold_rules_json) VALUES (?,?,?,?)`
      ).run(`Verified ${name}`, sid, "1", '{"min_confidence":0.72}');
    }

    function seedSubmission(talentId, github, live, explanation, skillsPayload) {
      ins(
        `INSERT INTO submissions (challenge_id, talent_id, project_description, github_url, live_url, explanation, video_url) VALUES (?,?,?,?,?,?,?)`
      ).run(
        challengeId,
        talentId,
        "Seeded proof project for matching demo.",
        github,
        live,
        explanation,
        null
      );
      const sid = Number(db.prepare("SELECT last_insert_rowid() as id").get().id);

      ins(
        `INSERT INTO evidence_analyses (submission_id, project_type, detected_features_json, file_structure_json, readme_signal, authenticity_risk, confidence_score, full_eval_json) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        sid,
        skillsPayload.projectType || "landing page",
        JSON.stringify(skillsPayload.features || ["responsive layout"]),
        JSON.stringify(["README.md", "package.json", "src/App.jsx"]),
        "Seeded README signal for demo.",
        "medium",
        skillsPayload.confidence || 82,
        "{}"
      );

      for (const row of skillsPayload.skills) {
        const skId = skillIds[row.name] || getOrCreateSkillId(db, row.name);
        ins(
          `INSERT INTO inferred_skills (talent_id, submission_id, skill_id, confidence, evidence_json, level) VALUES (?,?,?,?,?,?)`
        ).run(
          talentId,
          sid,
          skId,
          row.confidence,
          JSON.stringify({ evidence: row.evidence }),
          row.level || "intermediate"
        );
      }

      for (const b of skillsPayload.badges || []) {
        const badgeRow = db.prepare(`SELECT id FROM badges WHERE name = ?`).get(b.name);
        if (badgeRow) {
          ins(
            `INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score) VALUES (?,?,?,?,?)`
          ).run(talentId, badgeRow.id, sid, b.confidence, b.proof || 80);
        }
      }
    }

    function getOrCreateSkillId(database, name) {
      const x = database.prepare(`SELECT id FROM skills WHERE name = ?`).get(name);
      if (x) return x.id;
      return database.prepare(`INSERT INTO skills (name, category, ontology_source) VALUES (?,?,?)`).run(name, "General", "seed").lastInsertRowid;
    }

    seedSubmission(
      talent1,
      "https://github.com/amina/fintech-proof",
      "https://amina-fintech-proof.example.com",
      "Seeded: responsive landing, API rates widget, contact form.",
      {
        projectType: "landing page",
        features: ["responsive layout", "API-backed data", "validated form"],
        confidence: 88,
        skills: [
          { name: "Responsive UI Design", confidence: 0.94, evidence: "Hero and sections reflow", level: "advanced" },
          { name: "API Integration", confidence: 0.88, evidence: "Rates widget", level: "intermediate" },
          { name: "Form Handling", confidence: 0.91, evidence: "Contact form", level: "intermediate" }
        ],
        badges: [
          { name: "Verified Responsive UI Design", confidence: 0.94, proof: 90 },
          { name: "Verified API Integration", confidence: 0.88, proof: 85 }
        ]
      }
    );

    seedSubmission(
      talent2,
      "https://github.com/kofi/merchant-dashboard-proof",
      "https://kofi-merchant-dashboard.example.com",
      "Seeded: merchant analytics dashboard.",
      {
        projectType: "dashboard",
        features: ["tables", "sidebar", "data"],
        confidence: 85,
        skills: [
          { name: "Dashboard Layout and Navigation", confidence: 0.91, evidence: "Sidebar + cards", level: "intermediate" },
          {
            name: "Transaction or Financial Data Presentation",
            confidence: 0.87,
            evidence: "Transaction-style rows",
            level: "intermediate"
          },
          { name: "Responsive UI Design", confidence: 0.82, evidence: "Mobile layout", level: "intermediate" }
        ],
        badges: [{ name: "Verified Dashboard Layout and Navigation", confidence: 0.91, proof: 88 }]
      }
    );

    seedSubmission(
      talent3,
      "https://github.com/nadia/remittance-checkout-proof",
      "https://nadia-remittance-checkout.example.com",
      "Seeded: remittance checkout flow.",
      {
        projectType: "landing page",
        features: ["forms", "checkout", "validation"],
        confidence: 84,
        skills: [
          { name: "Form Validation", confidence: 0.93, evidence: "Multi-step validation", level: "advanced" },
          { name: "Responsive UI Design", confidence: 0.81, evidence: "Responsive checkout", level: "intermediate" }
        ],
        badges: [{ name: "Verified Form Validation", confidence: 0.93, proof: 90 }]
      }
    );

    // ── 7 additional diverse candidates ──────────────────────────────────────

    // Candidate 4: Kwame Asante — Node.js backend, Ghana
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Kwame Asante", "kwame@demo.unmapped", "Ghana", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(5, "Backend API developer", "Ghana", "I build REST APIs with Node.js and Express. Focused on fintech payment backends.", '["https://github.com/kwame"]', "open");
    seedSubmission(5,
      "https://github.com/kwame/payment-api",
      "https://kwame-payment-api.example.com",
      "Node.js REST API for a payment gateway. Express + Prisma + PostgreSQL. JWT auth, rate limiting, transaction logging, webhook delivery.",
      {
        projectType: "api backend",
        features: ["REST API", "database integration", "authentication", "webhook handling"],
        confidence: 86,
        skills: [
          { name: "Node.js Backend", confidence: 0.93, evidence: "Express + Prisma stack, 12 commits, full CRUD endpoints", level: "advanced" },
          { name: "Database Integration", confidence: 0.90, evidence: "Prisma ORM with PostgreSQL schema and migrations", level: "intermediate" },
          { name: "API Integration", confidence: 0.82, evidence: "Webhook delivery with retry logic", level: "intermediate" }
        ],
        badges: [
          { name: "Verified Node.js Backend", confidence: 0.93, proof: 88 },
          { name: "Verified Database Integration", confidence: 0.90, proof: 85 }
        ]
      }
    );

    // Candidate 5: Fatima Al-Rashid — data visualization, Nigeria
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Fatima Al-Rashid", "fatima@demo.unmapped", "Nigeria", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(6, "Data visualization engineer", "Nigeria", "I build charts, dashboards, and financial data UIs with React and Recharts.", '["https://github.com/fatima"]', "open");
    seedSubmission(6,
      "https://github.com/fatima/fintech-dashboard",
      "https://fatima-fintech-dashboard.example.com",
      "Analytics dashboard for fintech transactions. React + Recharts, 15 commits. Live URL responds in 800ms. Has test files with Jest.",
      {
        projectType: "dashboard",
        features: ["data visualization", "financial data presentation", "responsive layout", "testing"],
        confidence: 91,
        skills: [
          { name: "Data Visualization", confidence: 0.93, evidence: "Recharts in package.json, multiple chart components", level: "advanced" },
          { name: "Financial Data Presentation", confidence: 0.90, evidence: "Transaction list with filters, summary cards, totals row", level: "intermediate" },
          { name: "Dashboard UI", confidence: 0.88, evidence: "Sidebar navigation, analytics cards, responsive dashboard layout", level: "intermediate" },
          { name: "Responsive UI Design", confidence: 0.84, evidence: "Mobile layout verified via live URL", level: "intermediate" },
          { name: "Testing", confidence: 0.82, evidence: "Jest test files for chart and data components", level: "intermediate" }
        ],
        badges: [
          { name: "Verified Data Visualization", confidence: 0.93, proof: 92 },
          { name: "Verified Dashboard UI", confidence: 0.88, proof: 88 },
          { name: "Verified Testing", confidence: 0.82, proof: 80 }
        ]
      }
    );

    // Candidate 6: Carlos Mendez — full-stack React + Express, Kenya
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Carlos Mendez", "carlos@demo.unmapped", "Kenya", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(7, "Full-stack developer", "Kenya", "React frontend + Express backend. I deliver end-to-end product features.", '["https://github.com/carlos"]', "open");
    seedSubmission(7,
      "https://github.com/carlos/wallet-app",
      "https://carlos-wallet-app.example.com",
      "Mobile wallet onboarding + dashboard. React + Axios + Express backend. Form validation with Yup. TypeScript. 20 commits.",
      {
        projectType: "full-stack app",
        features: ["responsive UI", "API integration", "form validation", "TypeScript", "mobile-first"],
        confidence: 89,
        skills: [
          { name: "React", confidence: 0.92, evidence: "react + react-dom in package.json, 15 JSX components", level: "intermediate" },
          { name: "API Integration", confidence: 0.90, evidence: "Axios in package.json, custom API client with error handling", level: "intermediate" },
          { name: "Form Validation", confidence: 0.91, evidence: "Yup schema validation + react-hook-form", level: "advanced" },
          { name: "TypeScript", confidence: 0.88, evidence: "typescript in devDependencies, .ts files throughout", level: "intermediate" },
          { name: "Mobile-first Design", confidence: 0.82, evidence: "Mobile-first CSS, responsive across breakpoints", level: "intermediate" }
        ],
        badges: [
          { name: "Verified React", confidence: 0.92, proof: 90 },
          { name: "Verified Form Validation", confidence: 0.91, proof: 88 },
          { name: "Verified TypeScript", confidence: 0.88, proof: 86 }
        ]
      }
    );

    // Candidate 7: Amara Diallo — mobile-first specialist, Senegal
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Amara Diallo", "amara@demo.unmapped", "Senegal", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(8, "Mobile-first UI specialist", "Senegal", "I build for mobile first. Accessible, fast, touch-friendly interfaces.", '["https://github.com/amara"]', "open");
    seedSubmission(8,
      "https://github.com/amara/mobile-wallet-ui",
      "https://amara-wallet.example.com",
      "Mobile wallet onboarding: KYC form, PIN setup, confirmation screen. 360px-first. React. 8 commits. Accessible form states.",
      {
        projectType: "mobile UI",
        features: ["mobile-first", "form handling", "responsive layout", "accessibility"],
        confidence: 83,
        skills: [
          { name: "Mobile-first Design", confidence: 0.91, evidence: "360px viewport first, touch targets, CSS media queries", level: "advanced" },
          { name: "Form Handling", confidence: 0.87, evidence: "Multi-step onboarding form, PIN input, KYC fields", level: "intermediate" },
          { name: "Responsive UI Design", confidence: 0.84, evidence: "Verified responsive across mobile and tablet", level: "intermediate" },
          { name: "Component Structure", confidence: 0.78, evidence: "Reusable form steps and screen components", level: "intermediate" }
        ],
        badges: [
          { name: "Verified Mobile-first Design", confidence: 0.91, proof: 88 },
          { name: "Verified Form Handling", confidence: 0.87, proof: 84 }
        ]
      }
    );

    // Candidate 8: Joseph Okonkwo — beginner, Nigeria
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Joseph Okonkwo", "joseph@demo.unmapped", "Nigeria", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(9, "Junior frontend developer", "Nigeria", "Learning by building. 6 months of self-taught React and CSS.", '["https://github.com/joseph"]', "open");
    seedSubmission(9,
      "https://github.com/joseph/landing-page-v1",
      null,
      "Responsive landing page with a hero section and contact form. React. 3 commits. No live demo yet.",
      {
        projectType: "landing page",
        features: ["responsive layout", "form handling"],
        confidence: 58,
        skills: [
          { name: "Responsive UI Design", confidence: 0.68, evidence: "Mobile CSS breakpoints, responsive hero section", level: "beginner" },
          { name: "Form Handling", confidence: 0.65, evidence: "Contact form with basic validation", level: "beginner" }
        ],
        badges: []
      }
    );

    // Candidate 9: Priya Nair — checkout UI specialist, Kenya
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Priya Nair", "priya@demo.unmapped", "Kenya", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(10, "Checkout & payment UI engineer", "Kenya", "Expert in payment flows, form validation, and multi-step UX for fintech.", '["https://github.com/priya"]', "open");
    seedSubmission(10,
      "https://github.com/priya/checkout-flow",
      "https://priya-checkout.example.com",
      "Multi-step remittance checkout. React + react-hook-form + Yup. Amount validation, recipient fields, confirmation screen. 18 commits. All steps tested.",
      {
        projectType: "checkout flow",
        features: ["checkout UI", "form validation", "multi-step UX", "testing", "responsive"],
        confidence: 92,
        skills: [
          { name: "Checkout UI", confidence: 0.94, evidence: "Multi-step checkout flow with payment review and confirmation", level: "advanced" },
          { name: "Form Validation", confidence: 0.95, evidence: "react-hook-form + Yup, complex field rules, error states", level: "advanced" },
          { name: "Responsive UI Design", confidence: 0.86, evidence: "Live URL reachable, mobile-responsive checkout", level: "intermediate" },
          { name: "Testing", confidence: 0.83, evidence: "Test files for each checkout step", level: "intermediate" }
        ],
        badges: [
          { name: "Verified Checkout UI", confidence: 0.94, proof: 92 },
          { name: "Verified Form Validation", confidence: 0.95, proof: 93 },
          { name: "Verified Testing", confidence: 0.83, proof: 82 }
        ]
      }
    );

    // Candidate 10: Emmanuel Tetteh — TypeScript + testing, Ghana
    ins(`INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)`)
      .run("Emmanuel Tetteh", "emmanuel@demo.unmapped", "Ghana", "talent");
    ins(`INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links, availability_status) VALUES (?,?,?,?,?,?)`)
      .run(11, "TypeScript frontend engineer", "Ghana", "Production-quality React with TypeScript. Comprehensive test coverage. CI/CD pipelines.", '["https://github.com/emmanuel"]', "open");
    seedSubmission(11,
      "https://github.com/emmanuel/fintech-dashboard-ts",
      "https://emmanuel-fintech-ts.example.com",
      "Fintech dashboard with TypeScript, React Query, Recharts, and 90% test coverage. GitHub Actions CI. 25 commits. All API calls typed.",
      {
        projectType: "dashboard",
        features: ["TypeScript", "testing", "data visualization", "API integration", "CI/CD", "dashboard UI"],
        confidence: 95,
        skills: [
          { name: "TypeScript", confidence: 0.96, evidence: "typescript in deps, strict mode, all files .tsx/.ts", level: "advanced" },
          { name: "Testing", confidence: 0.94, evidence: "Jest + Testing Library, CI pipeline, 90% coverage", level: "advanced" },
          { name: "Data Visualization", confidence: 0.92, evidence: "Recharts in package.json, multiple chart types", level: "advanced" },
          { name: "API Integration", confidence: 0.91, evidence: "React Query for typed API calls, loading and error states", level: "advanced" },
          { name: "Dashboard UI", confidence: 0.90, evidence: "Full dashboard layout with sidebar, cards, and charts", level: "advanced" },
          { name: "Deployment Literacy", confidence: 0.88, evidence: "GitHub Actions CI/CD pipeline, Vercel deployment", level: "intermediate" }
        ],
        badges: [
          { name: "Verified TypeScript", confidence: 0.96, proof: 95 },
          { name: "Verified Testing", confidence: 0.94, proof: 93 },
          { name: "Verified Data Visualization", confidence: 0.92, proof: 90 },
          { name: "Verified API Integration", confidence: 0.91, proof: 89 }
        ]
      }
    );

    return companyRow.lastInsertRowid;
  });

  run();
}
