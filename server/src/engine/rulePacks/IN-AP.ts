import type { RulePack } from "../../types";

const ECI_SOURCE = {
  label: "Election Commission of India",
  url: "https://eci.gov.in",
  lastUpdated: "2026-01-01",
};

const NVSP_SOURCE = {
  label: "National Voters' Service Portal",
  url: "https://voters.eci.gov.in",
  lastUpdated: "2026-01-01",
};

export const IN_AP_RULE_PACK: RulePack = {
  jurisdictionId: "IN-AP",
  authority: "Election Commission of India",
  authorityUrl: "https://eci.gov.in",
  lastUpdated: "2026-04-01",
  version: "1.0.0",
  effectiveFrom: "2024-05-13",
  electionDate: "2024-05-13",
  rules: {
    eligibility: [
      {
        ruleId: "age_18",
        condition: { ageGroup: ["under_18"] },
        result: "ineligible",
        reason: {
          en: "You must be at least 18 years old to vote in India.",
          te: "భారతదేశంలో ఓటు వేయడానికి మీకు కనీసం 18 సంవత్సరాలు ఉండాలి.",
          hi: "भारत में मतदान के लिए आपकी आयु कम से कम 18 वर्ष होनी चाहिए।",
        },
        source: ECI_SOURCE,
      },
      {
        ruleId: "citizenship_required",
        condition: { citizenship: ["non_citizen"] },
        result: "ineligible",
        reason: {
          en: "Only Indian citizens are eligible to vote.",
          te: "కేవలం భారతీయ పౌరులు మాత్రమే ఓటు వేయడానికి అర్హులు.",
          hi: "केवल भारतीय नागरिक ही मतदान के पात्र हैं।",
        },
        source: ECI_SOURCE,
      },
      {
        ruleId: "nri_conditional",
        condition: { citizenship: ["nri"] },
        result: "conditional",
        reason: {
          en: "NRIs can vote but must be physically present at their polling booth on election day. Overseas voting is not available.",
          te: "NRIలు ఓటు వేయవచ్చు కానీ ఎన్నికల రోజున తమ పోలింగ్ బూత్‌లో శారీరకంగా హాజరు కావాలి.",
          hi: "NRI मतदान कर सकते हैं लेकिन चुनाव के दिन अपने मतदान केंद्र पर शारीरिक रूप से उपस्थित होना होगा।",
        },
        source: ECI_SOURCE,
      },
      {
        ruleId: "citizen_eligible",
        condition: {
          and: [
            { ageGroup: ["18_to_25", "26_to_60", "over_60"] },
            { citizenship: ["citizen", "nri"] },
          ],
        },
        result: "eligible",
        reason: {
          en: "You meet the basic eligibility criteria to vote in India.",
          te: "భారతదేశంలో ఓటు వేయడానికి మీరు ప్రాథమిక అర్హత ప్రమాణాలను పూర్తి చేస్తున్నారు.",
          hi: "आप भारत में मतदान करने के लिए बुनियादी पात्रता मानदंडों को पूरा करते हैं।",
        },
        source: ECI_SOURCE,
      },
    ],

    timeline: [
      {
        stepId: "check_voter_list",
        order: 1,
        label: {
          en: "Check if your name is on the voter list",
          te: "మీ పేరు ఓటర్ జాబితాలో ఉందో లేదో తనిఖీ చేయండి",
          hi: "जांचें कि आपका नाम मतदाता सूची में है या नहीं",
        },
        description: {
          en: "Search the Electoral Roll on NVSP or the Voter Helpline app using your name, EPIC number, or mobile number.",
          te: "మీ పేరు, EPIC నంబర్ లేదా మొబైల్ నంబర్ ఉపయోగించి NVSP లేదా Voter Helpline యాప్‌లో ఎలక్టోరల్ రోల్ శోధించండి.",
          hi: "अपने नाम, EPIC नंबर, या मोबाइल नंबर का उपयोग करके NVSP या Voter Helpline ऐप पर Electoral Roll में खोजें।",
        },
        consequence: {
          en: "If your name is not on the list, you cannot vote. You must register or correct your details.",
          te: "మీ పేరు జాబితాలో లేకుంటే, మీరు ఓటు వేయలేరు. మీరు నమోదు చేసుకోవాలి లేదా మీ వివరాలను సరిచేయాలి.",
          hi: "यदि आपका नाम सूची में नहीं है, तो आप मतदान नहीं कर सकते। आपको पंजीकरण कराना होगा या अपना विवरण सुधारना होगा।",
        },
        deadline: {
          type: "absolute",
          value: "2024-04-12",
          label: { en: "April 12, 2024", te: "ఏప్రిల్ 12, 2024", hi: "12 अप्रैल 2024" },
        },
        status: "required",
        channel: "online",
        prerequisiteStepIds: [],
        source: NVSP_SOURCE,
      },
      {
        stepId: "register",
        order: 2,
        label: {
          en: "Register to vote (Form 6)",
          te: "ఓటు వేయడానికి నమోదు చేసుకోండి (Form 6)",
          hi: "मतदाता पंजीकरण करें (फॉर्म 6)",
        },
        description: {
          en: "Apply online at voters.eci.gov.in or visit your local BLO (Booth Level Officer). Required for first-time voters or those who moved constituencies.",
          te: "voters.eci.gov.in లో ఆన్‌లైన్‌లో దరఖాస్తు చేయండి లేదా మీ స్థానిక BLO (బూత్ స్థాయి అధికారి)ని సందర్శించండి.",
          hi: "voters.eci.gov.in पर ऑनलाइन आवेदन करें या अपने स्थानीय BLO से मिलें।",
        },
        consequence: {
          en: "Without registration, you cannot vote. Registration closes 10 days before the election.",
          te: "నమోదు లేకుండా, మీరు ఓటు వేయలేరు. ఎన్నికలకు 10 రోజుల ముందు నమోదు మూసివేయబడుతుంది.",
          hi: "पंजीकरण के बिना, आप मतदान नहीं कर सकते। चुनाव से 10 दिन पहले पंजीकरण बंद हो जाता है।",
        },
        deadline: {
          type: "relative_to_election",
          value: "-30d",
          label: { en: "30 days before election day", te: "ఎన్నికల రోజుకు 30 రోజుల ముందు", hi: "चुनाव दिवस से 30 दिन पहले" },
        },
        status: "blocking",
        channel: "both",
        prerequisiteStepIds: ["check_voter_list"],
        source: NVSP_SOURCE,
        documentIds: ["aadhaar_or_id", "address_proof"],
      },
      {
        stepId: "prepare_documents",
        order: 3,
        label: {
          en: "Prepare your voter ID (EPIC card)",
          te: "మీ ఓటర్ ID (EPIC కార్డ్) సిద్ధం చేసుకోండి",
          hi: "अपना वोटर ID (EPIC कार्ड) तैयार करें",
        },
        description: {
          en: "Bring your EPIC card to the polling booth. If you don't have one, 12 alternate photo ID documents are accepted: Aadhaar, Passport, Driving License, PAN card, etc.",
          te: "పోలింగ్ బూత్‌కు మీ EPIC కార్డ్ తీసుకువెళ్ళండి. మీకు ఒకటి లేకుంటే, 12 ప్రత్యామ్నాయ ఫోటో ID పత్రాలు ఆమోదయోగ్యమవుతాయి.",
          hi: "मतदान केंद्र पर अपना EPIC कार्ड लाएं। यदि आपके पास नहीं है तो 12 वैकल्पिक फोटो ID दस्तावेज स्वीकार किए जाते हैं।",
        },
        consequence: {
          en: "Without a valid photo ID, you may be turned away at the polling booth.",
          te: "చెల్లుబాటు అయ్యే ఫోటో ID లేకుండా, పోలింగ్ బూత్‌లో మిమ్మల్ని తిరస్కరించవచ్చు.",
          hi: "वैध फोटो ID के बिना, मतदान केंद्र पर आपको वापस किया जा सकता है।",
        },
        deadline: {
          type: "relative_to_election",
          value: "-1d",
          label: { en: "Day before election", te: "ఎన్నికలకు ముందు రోజు", hi: "चुनाव से एक दिन पहले" },
        },
        status: "required",
        channel: "offline",
        prerequisiteStepIds: [],
        source: ECI_SOURCE,
        documentIds: ["epic_card"],
      },
      {
        stepId: "find_polling_booth",
        order: 4,
        label: {
          en: "Find your polling booth",
          te: "మీ పోలింగ్ బూత్ కనుగొనండి",
          hi: "अपना मतदान केंद्र खोजें",
        },
        description: {
          en: "Find your polling station using the Voter Helpline app, NVSP website, or SMS 'EPIC <your epic number>' to 1950.",
          te: "Voter Helpline యాప్, NVSP వెబ్‌సైట్ ద్వారా లేదా '1950'కి SMS 'EPIC <మీ epic నంబర్>' పంపి మీ పోలింగ్ స్టేషన్ కనుగొనండి.",
          hi: "Voter Helpline ऐप, NVSP वेबसाइट द्वारा या SMS 'EPIC <आपका epic नंबर>' 1950 पर भेजकर अपना मतदान केंद्र खोजें।",
        },
        consequence: {
          en: "You can only vote at your designated booth. Arriving at the wrong booth will mean you cannot vote.",
          te: "మీరు మీ నియమిత బూత్‌లో మాత్రమే ఓటు వేయగలరు. తప్పుడు బూత్‌కు వెళ్ళడం వల్ల మీరు ఓటు వేయలేరు.",
          hi: "आप केवल अपने निर्धारित बूथ पर ही मतदान कर सकते हैं।",
        },
        deadline: {
          type: "relative_to_election",
          value: "-1d",
          label: { en: "Day before election", te: "ఎన్నికలకు ముందు రోజు", hi: "चुनाव से एक दिन पहले" },
        },
        status: "required",
        channel: "online",
        prerequisiteStepIds: ["check_voter_list"],
        source: NVSP_SOURCE,
      },
      {
        stepId: "cast_vote",
        order: 5,
        label: {
          en: "Cast your vote",
          te: "మీ ఓటు వేయండి",
          hi: "मतदान करें",
        },
        description: {
          en: "Arrive at your polling booth with your EPIC card and any supporting ID. Polling hours are typically 7:00 AM – 6:00 PM. Queue up, verify identity, receive ballot, vote on EVM.",
          te: "మీ EPIC కార్డ్ మరియు ఏదైనా సహాయక ID తో మీ పోలింగ్ బూత్‌కు వెళ్ళండి. పోలింగ్ సమయాలు సాధారణంగా ఉదయం 7:00 – సాయంత్రం 6:00.",
          hi: "अपने EPIC कार्ड और कोई भी सहायक ID के साथ अपने मतदान केंद्र पर पहुंचें। मतदान समय सुबह 7:00 - शाम 6:00 बजे तक।",
        },
        consequence: {
          en: "Missing election day means waiting until the next election cycle.",
          te: "ఎన్నికల రోజు మిస్ అవడం అంటే తదుపరి ఎన్నికల వరకు వేచి ఉండటం.",
          hi: "चुनाव दिवस चूकने का मतलब है अगले चुनाव चक्र तक प्रतीक्षा करना।",
        },
        deadline: {
          type: "absolute",
          value: "2024-05-13",
          label: { en: "Election day: May 13, 2024", te: "ఎన్నికల రోజు: మే 13, 2024", hi: "चुनाव दिवस: 13 मई 2024" },
        },
        status: "required",
        channel: "offline",
        prerequisiteStepIds: ["check_voter_list", "prepare_documents", "find_polling_booth"],
        source: ECI_SOURCE,
      },
    ],

    scenarios: [
      {
        scenarioId: "missed_registration",
        triggerKeywords: ["missed registration", "registration closed", "not registered", "register late"],
        intentTags: ["MISSED_DEADLINE"],
        conditions: [{ field: "registrationStatus", operator: "eq", value: "not_registered" }],
        outcomes: [
          {
            label: { en: "Registration window may be closed", te: "నమోదు విండో మూసివేయబడి ఉండవచ్చు" , hi: "पंजीकरण विंडो बंद हो सकती है" },
            description: {
              en: "If the election is within 30 days, the window to register via Form 6 is likely closed. You can still check your name on the roll — sometimes names appear due to automatic updates.",
              te: "ఎన్నికలు 30 రోజులలో ఉంటే, Form 6 ద్వారా నమోదు చేసుకునే విండో మూసివేయబడి ఉంటుంది.",
              hi: "यदि चुनाव 30 दिनों के भीतर है, तो Form 6 के माध्यम से पंजीकरण की विंडो शायद बंद हो गई है।",
            },
            steps: ["check_voter_list"],
            urgency: "high",
            source: NVSP_SOURCE,
          },
        ],
        confidenceThreshold: 0.45,
        fallbackMessage: {
          en: "Unable to determine registration status with certainty. Please check the official NVSP portal or contact the Voter Helpline at 1950.",
          te: "నమోదు స్థితిని నిర్ధారించడం సాధ్యం కాలేదు. దయచేసి అధికారిక NVSP పోర్టల్ తనిఖీ చేయండి లేదా 1950కి సంప్రదించండి.",
          hi: "पंजीकरण स्थिति निर्धारित करने में असमर्थ। कृपया आधिकारिक NVSP पोर्टल जांचें या 1950 पर संपर्क करें।",
        },
      },
      {
        scenarioId: "lost_id",
        triggerKeywords: ["lost id", "lost voter card", "no id", "don't have id", "lost epic"],
        intentTags: ["LOST_DOCUMENT"],
        conditions: [],
        outcomes: [
          {
            label: { en: "12 alternate IDs accepted", te: "12 ప్రత్యామ్నాయ IDs ఆమోదించబడతాయి", hi: "12 वैकल्पिक ID स्वीकार किए जाते हैं" },
            description: {
              en: "Even without your EPIC card, you can vote using: Aadhaar, Passport, Driving License, PAN card, MNREGA job card, bank passbook, health insurance smart card, pension document, NPR smart card, or official government identity document.",
              te: "EPIC కార్డ్ లేకుండా కూడా మీరు ఆధార్, పాస్‌పోర్ట్, డ్రైవింగ్ లైసెన్స్, PAN కార్డ్ వంటివి ఉపయోగించి ఓటు వేయవచ్చు.",
              hi: "EPIC कार्ड के बिना भी आधार, पासपोर्ट, ड्राइविंग लाइसेंस, PAN कार्ड आदि से मतदान कर सकते हैं।",
            },
            steps: ["prepare_documents", "find_polling_booth", "cast_vote"],
            urgency: "medium",
            source: ECI_SOURCE,
          },
        ],
        confidenceThreshold: 0.45,
        fallbackMessage: {
          en: "Please contact the Voter Helpline at 1950 for guidance on acceptable ID documents in your constituency.",
          te: "మీ నియోజకవర్గంలో ఆమోదయోగ్యమైన ID పత్రాలపై మార్గదర్శకత్వం కోసం దయచేసి 1950 వద్ద Voter Helpline సంప్రదించండి.",
          hi: "अपने निर्वाचन क्षेत्र में स्वीकार्य ID दस्तावेजों के मार्गदर्शन के लिए 1950 पर Voter Helpline से संपर्क करें।",
        },
      },
      {
        scenarioId: "relocated",
        triggerKeywords: ["moved", "relocated", "new address", "shifted", "different constituency"],
        intentTags: ["RELOCATION"],
        conditions: [],
        outcomes: [
          {
            label: { en: "Submit Form 8A to update address", te: "చిరునామా నవీకరించడానికి Form 8A సమర్పించండి", hi: "पता अपडेट करने के लिए Form 8A सबमिट करें" },
            description: {
              en: "If you moved within the same constituency, submit Form 8A online at NVSP. If you moved to a different constituency, you must delete your name from the old roll (Form 7) and register fresh (Form 6) in the new constituency.",
              te: "మీరు అదే నియోజకవర్గంలో తరలిపోయినట్లయితే, NVSP లో ఆన్‌లైన్‌లో Form 8A సమర్పించండి.",
              hi: "यदि आप उसी निर्वाचन क्षेत्र में चले गए हैं, तो NVSP पर ऑनलाइन Form 8A सबमिट करें।",
            },
            steps: ["check_voter_list", "register"],
            urgency: "high",
            source: NVSP_SOURCE,
          },
        ],
        confidenceThreshold: 0.45,
        fallbackMessage: {
          en: "For relocation queries, please visit voters.eci.gov.in or call 1950 to speak with a helpline officer.",
          te: "తరలింపు విచారణల కోసం, దయచేసి voters.eci.gov.in సందర్శించండి లేదా హెల్ప్‌లైన్ అధికారితో మాట్లాడటానికి 1950కి కాల్ చేయండి.",
          hi: "स्थानांतरण से संबंधित प्रश्नों के लिए कृपया voters.eci.gov.in पर जाएं या 1950 पर कॉल करें।",
        },
      },
    ],

    documents: [
      {
        docId: "epic_card",
        label: { en: "EPIC Card (Voter ID)", te: "EPIC కార్డ్ (ఓటర్ ID)", hi: "EPIC कार्ड (वोटर ID)" },
        description: {
          en: "Your Elector Photo Identity Card issued by the Election Commission of India.",
          te: "భారత ఎన్నికల కమిషన్ జారీ చేసిన మీ ఎలక్టర్ ఫోటో గుర్తింపు కార్డ్.",
          hi: "भारत निर्वाचन आयोग द्वारा जारी आपका इलेक्टर फोटो पहचान पत्र।",
        },
        alternatives: [
          { en: "Aadhaar Card", te: "ఆధార్ కార్డ్", hi: "आधार कार्ड" },
          { en: "Passport", te: "పాస్‌పోర్ట్", hi: "पासपोर्ट" },
          { en: "Driving License", te: "డ్రైవింగ్ లైసెన్స్", hi: "ड्राइविंग लाइसेंस" },
          { en: "PAN Card", te: "PAN కార్డ్", hi: "PAN कार्ड" },
        ],
        officialLink: "https://eci.gov.in/voter/epic-card",
      },
      {
        docId: "aadhaar_or_id",
        label: { en: "Aadhaar or Government ID", te: "ఆధార్ లేదా ప్రభుత్వ ID", hi: "आधार या सरकारी ID" },
        description: {
          en: "Any government-issued photo ID for identity verification during registration.",
          te: "నమోదు సమయంలో గుర్తింపు ధృవీకరణకు ఏదైనా ప్రభుత్వ జారీ చేసిన ఫోటో ID.",
          hi: "पंजीकरण के दौरान पहचान सत्यापन के लिए कोई भी सरकारी फोटो ID।",
        },
        officialLink: "https://uidai.gov.in",
      },
      {
        docId: "address_proof",
        label: { en: "Address Proof", te: "చిరునామా రుజువు", hi: "पते का प्रमाण" },
        description: {
          en: "Utility bill, bank statement, or any document showing your current residential address.",
          te: "యుటిలిటీ బిల్, బ్యాంక్ స్టేట్‌మెంట్, లేదా మీ ప్రస్తుత నివాస చిరునామాను చూపించే ఏదైనా పత్రం.",
          hi: "उपयोगिता बिल, बैंक स्टेटमेंट, या कोई भी दस्तावेज़ जो आपका वर्तमान आवासीय पता दर्शाता हो।",
        },
      },
    ],
  },
};
