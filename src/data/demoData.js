/**
 * Canonical demo dataset and whitelist definitions for Milestone 12A.
 * 
 * Safety boundary:
 * All demo documents belong to an explicit, deterministic ID whitelist.
 * Seeding and management scripts MUST ONLY touch documents in these whitelists.
 */

// 1. Primary demo student persona (Alex Rivera)
export const DEMO_PRIMARY_STUDENT = {
  displayName: "Alex Rivera",
  email: "demo.student@campusconnect.edu",
  photoURL: null,
  bio: "Architecture senior focused on regenerative campus spaces and sustainable wood construction. Founder of the Atelier Studio Workshop. Always looking to collaborate with computational designers and artists.",
  department: "Architecture & Spatial Design",
  year: "Senior (Class of 2026)",
  skills: [
    "Spatial Design",
    "Rhino 3D",
    "Sustainable Urbanism",
    "Physical Prototyping",
    "Figma",
  ],
  socialLinks: {
    github: "https://github.com",
    linkedin: "https://linkedin.com",
    portfolio: "https://portfolio.edu",
    website: "",
  },
  isDiscoverable: true,
  notificationPreferences: {
    connectionRequests: true,
    connectionAccepted: true,
  },
  isDemo: true,
};

// 2. Peer student profiles (Firestore-only profiles, no Firebase Auth accounts required)
export const DEMO_PEER_PROFILES = [
  {
    uid: "demo_peer_maya",
    displayName: "Maya Lin",
    email: "maya.lin@campusconnect.edu",
    photoURL: null,
    bio: "Industrial designer exploring mycelium biomaterials, circular product cycles, and ergonomic student studio furniture.",
    department: "Industrial Design",
    year: "Junior",
    skills: ["CAD Modeling", "Biomaterials", "Rapid Prototyping", "User Research", "SolidWorks"],
    socialLinks: {
      github: "",
      linkedin: "https://linkedin.com",
      portfolio: "https://mayalin.design",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_marcus",
    displayName: "Marcus Vance",
    email: "marcus.vance@campusconnect.edu",
    photoURL: null,
    bio: "Graphic designer obsessed with editorial typography, Risograph printing, and independent campus literary journals.",
    department: "Graphic Design & Typography",
    year: "Senior",
    skills: ["Typography", "Editorial Layout", "Printmaking", "Art Direction", "InDesign"],
    socialLinks: {
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      portfolio: "https://marcusvance.studio",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_elena",
    displayName: "Elena Rostova",
    email: "elena.rostova@campusconnect.edu",
    photoURL: null,
    bio: "CS graduate researcher working on local model quantization and efficient attention mechanisms on edge microcontrollers.",
    department: "Computer Science & AI",
    year: "Graduate",
    skills: ["PyTorch", "Model Quantization", "CUDA", "Distributed Systems", "C++"],
    socialLinks: {
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      portfolio: "",
      website: "https://elena-ai.research",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_devon",
    displayName: "Devon Park",
    email: "devon.park@campusconnect.edu",
    photoURL: null,
    bio: "Mechanical engineering student building autonomous planetary rover chassis for the University Robotics Team.",
    department: "Mechanical Engineering",
    year: "Junior",
    skills: ["Mechatronics", "Robotics", "ROS 2", "FEA Analysis", "CNC Machining"],
    socialLinks: {
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      portfolio: "",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_sofia",
    displayName: "Sofia Alvarez",
    email: "sofia.alvarez@campusconnect.edu",
    photoURL: null,
    bio: "Creative technologist crafting live audio-reactive visuals, GLSL shaders, and projection mapping environments for sound performances.",
    department: "Interactive Media Arts",
    year: "Senior",
    skills: ["TouchDesigner", "GLSL Shaders", "WebGL", "Creative Coding", "Ableton Live"],
    socialLinks: {
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      portfolio: "https://sofia-alvarez.art",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_liam",
    displayName: "Liam O'Connor",
    email: "liam.oconnor@campusconnect.edu",
    photoURL: null,
    bio: "Literature & environmental humanities major researching poetic responses to urbanization and archival campus flora records.",
    department: "Environmental Literature",
    year: "Sophomore",
    skills: ["Archival Research", "Creative Nonfiction", "Copyediting", "Oral History", "Critical Theory"],
    socialLinks: {
      github: "",
      linkedin: "https://linkedin.com",
      portfolio: "",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
  {
    uid: "demo_peer_chloe",
    displayName: "Chloe Bennett",
    email: "chloe.bennett@campusconnect.edu",
    photoURL: null,
    bio: "Curatorial student organizing the annual undergraduate gallery showcase. Passionate about 20th-century brutalist campus architecture.",
    department: "Art History & Visual Culture",
    year: "Junior",
    skills: ["Exhibition Design", "Curatorial Practice", "Visual Criticism", "Art Writing"],
    socialLinks: {
      github: "",
      linkedin: "https://linkedin.com",
      portfolio: "https://chloebennett.curates",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    isDemo: true,
  },
];

// 3. Whitelisted feed posts (10 posts)
export const DEMO_POSTS = [
  {
    id: "demo_post_01",
    authorKey: "alex", // Resolved to demoAuthUid at seed time
    authorName: "Alex Rivera",
    content: "Open studio this Thursday from 5–8 PM in the South Architecture Courtyard! We'll be showing full-scale joinery prototypes for the regenerative timber pavilion. Coffee and cider provided — all departments welcome.",
    likesCount: 6,
    commentsCount: 2,
    hoursAgo: 2,
    comments: [
      {
        id: "demo_comment_01_1",
        authorId: "demo_peer_maya",
        authorName: "Maya Lin",
        content: "Will you have the steam-bent cedar samples out? Would love to feel the tensile strength in person!",
        minutesAgo: 95,
      },
      {
        id: "demo_comment_01_2",
        authorKey: "alex",
        authorName: "Alex Rivera",
        content: "Yes! Maya, we just finished clamping the test ring this morning. Looking forward to your thoughts.",
        minutesAgo: 45,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_marcus", "demo_peer_devon", "demo_peer_sofia", "demo_peer_liam", "demo_peer_chloe"],
  },
  {
    id: "demo_post_02",
    authorId: "demo_peer_sofia",
    authorName: "Sofia Alvarez",
    content: "Just rendered the real-time GLSL audio reactive shader for this weekend's media arts showcase. 60 FPS on integrated graphics! Big shoutout to the lab TAs for helping debug the buffer swap.",
    likesCount: 11,
    commentsCount: 3,
    hoursAgo: 5,
    comments: [
      {
        id: "demo_comment_02_1",
        authorId: "demo_peer_elena",
        authorName: "Elena Rostova",
        content: "That buffer swap optimization was brilliant Sofia. Did you end up binding half-float precision textures?",
        minutesAgo: 240,
      },
      {
        id: "demo_comment_02_2",
        authorId: "demo_peer_sofia",
        authorName: "Sofia Alvarez",
        content: "Exactly! 16-bit half floats saved almost 40% memory bandwidth on the fragment pass.",
        minutesAgo: 190,
      },
      {
        id: "demo_comment_02_3",
        authorKey: "alex",
        authorName: "Alex Rivera",
        content: "Incredible visuals Sofia! We'd love to project these onto the timber pavilion during the final review.",
        minutesAgo: 110,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_marcus", "demo_peer_elena", "demo_peer_devon", "demo_peer_liam", "demo_peer_chloe"],
  },
  {
    id: "demo_post_03",
    authorId: "demo_peer_marcus",
    authorName: "Marcus Vance",
    content: "Why do most student organizations still use standard geometric sans for academic symposiums? A well-crafted modern serif like Newsreader conveys so much more intellectual warmth and editorial intent.",
    likesCount: 4,
    commentsCount: 1,
    hoursAgo: 8,
    comments: [
      {
        id: "demo_comment_03_1",
        authorId: "demo_peer_liam",
        authorName: "Liam O'Connor",
        content: "Could not agree more. Editorial serifs command patience and deliberate reading. The humanities journal transitioned last semester and readership increased.",
        minutesAgo: 400,
      },
    ],
    likedBy: ["demo_peer_liam", "demo_peer_chloe"],
  },
  {
    id: "demo_post_04",
    authorId: "demo_peer_devon",
    authorName: "Devon Park",
    content: "The Autonomous Rover team is officially looking for an industrial design collaborator to help redesign our sensor mast and battery bay ergonomics for the spring competition. Send me a connection request if you're interested!",
    likesCount: 5,
    commentsCount: 2,
    hoursAgo: 12,
    comments: [
      {
        id: "demo_comment_04_1",
        authorId: "demo_peer_maya",
        authorName: "Maya Lin",
        content: "Devon, I just finished an IP65 housing study! Let's chat tomorrow afternoon near the machine shop.",
        minutesAgo: 650,
      },
      {
        id: "demo_comment_04_2",
        authorId: "demo_peer_devon",
        authorName: "Devon Park",
        content: "Awesome Maya! I'll bring the STEP files and current chassis assembly.",
        minutesAgo: 600,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_elena"],
  },
  {
    id: "demo_post_05",
    authorId: "demo_peer_elena",
    authorName: "Elena Rostova",
    content: "Published our benchmark notes on 4-bit INT4 quantization for local reasoning models running on battery-powered edge hardware. Inference latency dropped 3.2x with zero loss on domain retrieval.",
    likesCount: 8,
    commentsCount: 1,
    hoursAgo: 16,
    comments: [
      {
        id: "demo_comment_05_1",
        authorId: "demo_peer_devon",
        authorName: "Devon Park",
        content: "This is huge for our onboard navigation compute budget. Reading the paper right now.",
        minutesAgo: 850,
      },
    ],
    likedBy: ["demo_peer_devon", "demo_peer_sofia"],
  },
  {
    id: "demo_post_06",
    authorId: "demo_peer_liam",
    authorName: "Liam O'Connor",
    content: "Campus field note: the fourth-floor reading alcove in the East Wing has the most generous afternoon natural light between 3 and 5 PM. Bring a physical notebook — reception is delightfully weak.",
    likesCount: 14,
    commentsCount: 2,
    hoursAgo: 22,
    comments: [
      {
        id: "demo_comment_06_1",
        authorId: "demo_peer_chloe",
        authorName: "Chloe Bennett",
        content: "Shhh, don't give away our secret sanctuary Liam! That was my primary drafting spot for art history theses.",
        minutesAgo: 1200,
      },
      {
        id: "demo_comment_06_2",
        authorKey: "alex",
        authorName: "Alex Rivera",
        content: "The clerestory windows up there were designed in 1974 specifically to diffuse southern glare. An architectural masterpiece!",
        minutesAgo: 1100,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_marcus", "demo_peer_chloe", "demo_peer_sofia"],
  },
  {
    id: "demo_post_07",
    authorId: "demo_peer_maya",
    authorName: "Maya Lin",
    content: "First batch of mycelium acoustic tiles just cured! The sound absorption coefficients beat polyurethane foam by 18% in mid-range vocal frequencies. Completely compostable at end-of-life.",
    likesCount: 7,
    commentsCount: 2,
    hoursAgo: 28,
    comments: [
      {
        id: "demo_comment_07_1",
        authorKey: "alex",
        authorName: "Alex Rivera",
        content: "Maya, can we use these in the acoustic test room next week? The texture looks stunning.",
        minutesAgo: 1500,
      },
      {
        id: "demo_comment_07_2",
        authorId: "demo_peer_maya",
        authorName: "Maya Lin",
        content: "Absolutely! I have six panels boxed and ready to mount.",
        minutesAgo: 1400,
      },
    ],
    likedBy: ["demo_peer_marcus", "demo_peer_chloe"],
  },
  {
    id: "demo_post_08",
    authorId: "demo_peer_chloe",
    authorName: "Chloe Bennett",
    content: "Curatorial update: The 2026 Spring Undergrad Exhibition catalog is heading to print next week. Featuring 34 student artists across ceramics, generative code, and printmaking.",
    likesCount: 3,
    commentsCount: 1,
    hoursAgo: 34,
    comments: [
      {
        id: "demo_comment_08_1",
        authorId: "demo_peer_marcus",
        authorName: "Marcus Vance",
        content: "The riso proofs look crisp Chloe. The two-color ink overlay came out even better than the digital mockup.",
        minutesAgo: 1900,
      },
    ],
    likedBy: ["demo_peer_marcus", "demo_peer_liam"],
  },
  {
    id: "demo_post_09",
    authorKey: "alex",
    authorName: "Alex Rivera",
    content: "Drafting the assembly manual for our studio's flat-pack drafting desks. Focusing on zero-hardware mortise-and-tenon joints that can be disassembled with a single wooden mallet.",
    likesCount: 2,
    commentsCount: 1,
    hoursAgo: 40,
    comments: [
      {
        id: "demo_comment_09_1",
        authorId: "demo_peer_maya",
        authorName: "Maya Lin",
        content: "Make sure you radius the wedge pins slightly so they don't split under cross-grain expansion!",
        minutesAgo: 2300,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_marcus"],
  },
  {
    id: "demo_post_10",
    authorId: "demo_peer_marcus",
    authorName: "Marcus Vance",
    content: "Submissions for Volume 8 of the Campus Atelier Review close this Friday. Send us your poems, architectural sketches, essays, or photo essays. Let's make this print issue historic.",
    likesCount: 9,
    commentsCount: 2,
    hoursAgo: 48,
    comments: [
      {
        id: "demo_comment_10_1",
        authorId: "demo_peer_liam",
        authorName: "Liam O'Connor",
        content: "Submitted our field notes on the campus arboretum! Excited to see the layout come together.",
        minutesAgo: 2700,
      },
    ],
    likedBy: ["demo_peer_maya", "demo_peer_liam", "demo_peer_chloe"],
  },
];

// 4. Primary Safety Whitelists
export const DEMO_PEER_ID_LIST = DEMO_PEER_PROFILES.map((p) => p.uid);
export const DEMO_POST_ID_LIST = DEMO_POSTS.map((p) => p.id);

export const DEMO_PEER_IDS = new Set(DEMO_PEER_ID_LIST);
export const DEMO_POST_IDS = new Set(DEMO_POST_ID_LIST);

/**
 * Computes canonical connection document ID: min(a, b) + "_" + max(a, b)
 */
export function getDemoConnectionId(uidA, uidB) {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}
