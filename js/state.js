let currentUser = null;
let currentView = 'week';
let collapsedMonthsState = {};

let cachedShameEntries = [];
let currentShameSubView = 'new';

const POPULAR_EMOJIS = ['🐳', '❤️', '😍', '😡', '😱', '🔥', '🥶', '💀'];
let openReactionPickerId = null;

const commentsCache = {};      // entryId -> array of comments
const loadedComments = {};     // entryId -> bool (уже завантажено)
const demoCommentsFallback = { text: "Поки що ніхто не прокоментував 🤐" };

let particles = [];
let confettiLoopRunning = false;
