/**
 * Word banks for "Get ChurchED" — a digital take on the Christian party game
 * (3 games in 1: Sing, Act, Explain).
 *
 * MODES:
 *  - sing    (🟡): a single evocative word; the team sings a real Christian
 *                  song that contains it.
 *  - act     (🔴): a Bible scene / character to act out silently (charades).
 *  - explain (🔵): a Bible person / place / concept to describe without saying
 *                  the word itself.
 *
 * These are original word lists inspired by the game's categories — not copied
 * from the physical deck. Keep them respectful and broadly recognizable.
 */

const WORD_BANKS = {
  sing: [
    'Jesus', 'Grace', 'Hallelujah', 'Holy', 'Victory', 'Faith', 'Love', 'Cross',
    'Heaven', 'Praise', 'Mercy', 'Glory', 'Worthy', 'Freedom', 'Fire', 'River',
    'Mountain', 'Light', 'King', 'Lamb', 'Spirit', 'Redeemer', 'Savior', 'Shepherd',
    'Blood', 'Alive', 'Rise', 'Water', 'Chains', 'Name', 'Goodness', 'Faithful',
    'Ocean', 'Mighty', 'Wonderful', 'Great', 'Amazing', 'Hope', 'Joy', 'Peace',
    'Everlasting', 'Salvation', 'Rock', 'Shelter', 'Morning', 'Rain', 'Breakthrough',
    'Miracle', 'Highest', 'Wonders', 'Almighty', 'Cornerstone',
  ],

  act: [
    "Noah's Ark", 'David and Goliath', 'Jonah and the whale', 'Parting the Red Sea',
    'Walking on water', 'The Last Supper', 'The Resurrection', 'Adam and Eve',
    "Daniel in the lions' den", 'Feeding the five thousand', 'The Nativity',
    'The burning bush', 'The Ten Commandments', 'Tower of Babel', 'Samson',
    'Fishers of men', 'The prodigal son', 'The Good Samaritan',
    'Woman touches the garment', 'Doubting Thomas', 'Zacchaeus in the tree',
    'The wise men', 'Manna from heaven', 'Palm Sunday', "Washing the disciples' feet",
    'An angel appears', 'Baptism of Jesus', 'Cain and Abel', 'Moses in the basket',
    "Joseph's coat of many colors", 'The plagues of Egypt', 'Jesus calms the storm',
    'The empty tomb', 'Peter denies Jesus', 'The ascension', 'Crossing the Jordan',
    'Elijah calls down fire', "Balaam's donkey", 'The fiery furnace',
    'The wedding at Cana', 'A blind man sees', 'Raising Lazarus', 'The crucifixion',
    'Ruth and Naomi', 'Building the temple', 'The rich young ruler',
  ],

  explain: [
    'Bethlehem', 'Hosea', 'Trinity', 'Genesis', 'Exodus', 'Pentecost', 'Nazareth',
    'Galilee', 'Jerusalem', 'Gethsemane', 'Golgotha', 'Pharisee', 'Disciple',
    'Prophet', 'Parable', 'Covenant', 'Gospel', 'Testament', 'Sabbath', 'Communion',
    'Salvation', 'Repentance', 'Resurrection', 'Jordan River', 'Mount Sinai', 'Eden',
    'Babylon', 'Goliath', 'Methuselah', 'Melchizedek', 'Beatitudes', 'Epistle',
    'Apostle', 'Psalm', 'Proverb', 'Manna', 'Tithe', 'Baptism', 'Emmanuel', 'Messiah',
    'Sanctuary', 'Passover', 'Ark of the Covenant', 'Promised Land', 'The Prodigal',
    'Samaritan', 'Bethany', 'Calvary', 'Nazarene', 'Shepherd',
  ],
};

/** Human-facing metadata for each mode. */
const MODE_INFO = {
  sing: {
    key: 'sing',
    label: 'Sing-Off',
    emoji: '🎵',
    color: '#F6C453', // amber
    tag: 'Yellow',
    short: 'Teams race to sing a song with the word',
    how: 'A word appears and every team races to sing a real Christian song that includes it. The first team to sing one wins the point — then on to the next word!',
    verb: 'Sang it',
  },
  act: {
    key: 'act',
    label: 'Act',
    emoji: '🎭',
    color: '#F0616D', // ruby
    tag: 'Red',
    short: 'Act it out — no talking!',
    how: 'One person acts out the scene silently while their team guesses. No words, no sounds!',
    verb: 'Guessed it',
  },
  explain: {
    key: 'explain',
    label: 'Explain',
    emoji: '💬',
    color: '#5AA9F6', // sapphire
    tag: 'Blue',
    short: 'Describe it — never say the word',
    how: 'One person describes the word any way they like — just never say the word (or part of it) itself.',
    verb: 'Guessed it',
  },
};

// Expose as plain-script globals for game.js.
window.WORD_BANKS = WORD_BANKS;
window.MODE_INFO = MODE_INFO;
