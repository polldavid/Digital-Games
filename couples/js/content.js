/* =========================================================
   Heart to Heart — content bank
   Everything the app says lives here, so prompts, questions
   and ideas can be edited without touching the app logic.
   Scripture is quoted from the King James Version (public
   domain). In the KJV, "charity" means love.
   ========================================================= */
window.HTH = window.HTH || {};

/* ---------- Weekly check-in prompts ---------- */
HTH.CHECKIN = {
  life: {
    title: 'Life', emoji: '🌱',
    blurb: 'How life has really been — the highs, the lows, the to-do list.',
    prompts: [
      'What was the high point of your week — and the low point?',
      'What’s taking up most of your headspace right now?',
      'What’s one thing you’re looking forward to in the next few weeks?',
      'Is anything stressing you out that I might not know about?',
      'How are you sleeping, eating and resting lately — honestly?',
      'What’s one small win from this week worth celebrating?',
      'How is work (or school, or the daily grind) treating you?',
      'Who have you connected with this week — and who do you miss?',
      'What’s one thing on your to-do list I could take off your plate?',
      'If this week had a title, what would it be?'
    ]
  },
  faith: {
    title: 'Faith', emoji: '✝️',
    blurb: 'Where you each are with God right now.',
    prompts: [
      'Where have you noticed God at work this week?',
      'How has your time with God been lately — close, distant, somewhere in between?',
      'Is there a verse, sermon or song that has stuck with you recently?',
      'What’s one thing you’re thanking God for right now?',
      'Is there anything you’re finding hard to trust God with?',
      'Is there a question or doubt you’ve been chewing on?',
      'How could we grow spiritually together this month?',
      'Where do you feel God might be stretching you right now?',
      'Who is someone we could serve or encourage this week?',
      'What would real rest look like for your soul right now?'
    ]
  },
  us: {
    title: 'Us', emoji: '💞',
    blurb: 'How the two of you are doing — as a team.',
    prompts: [
      'When did you feel most loved by me this week?',
      'Did anything I did hurt or frustrate you that we should talk about?',
      'What’s one thing I could do this week that would make you feel cared for?',
      'What’s something you appreciate about me that you haven’t said lately?',
      'Do we need more time together, more time apart, or is the balance right?',
      'What’s one thing we’re doing well as a team right now?',
      'Is there a conversation we’ve been putting off?',
      'What’s a memory from this month you want to hold onto?',
      'How can we make our next date feel special?',
      'From 1 to 10, how connected do you feel to me — and what would move it up one?'
    ]
  }
};

HTH.MOODS = [
  { emoji: '😞', label: 'Rough' },
  { emoji: '😕', label: 'Meh' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😄', label: 'Great' }
];

/* ---------- Verses (closing blessings / verse of the day) ---------- */
HTH.VERSES = [
  { text: 'Two are better than one; because they have a good reward for their labour. For if they fall, the one will lift up his fellow.', ref: 'Ecclesiastes 4:9–10' },
  { text: 'And if one prevail against him, two shall withstand him; and a threefold cord is not quickly broken.', ref: 'Ecclesiastes 4:12' },
  { text: 'And above all these things put on charity, which is the bond of perfectness.', ref: 'Colossians 3:14' },
  { text: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you.', ref: 'Ephesians 4:32' },
  { text: 'Rejoicing in hope; patient in tribulation; continuing instant in prayer.', ref: 'Romans 12:12' },
  { text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.', ref: 'Philippians 4:6' },
  { text: 'The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee: the LORD lift up his countenance upon thee, and give thee peace.', ref: 'Numbers 6:24–26' },
  { text: 'Let all your things be done with charity.', ref: '1 Corinthians 16:14' },
  { text: 'Bear ye one another’s burdens, and so fulfil the law of Christ.', ref: 'Galatians 6:2' },
  { text: 'Beloved, let us love one another: for love is of God; and every one that loveth is born of God, and knoweth God.', ref: '1 John 4:7' },
  { text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'Many waters cannot quench love, neither can the floods drown it.', ref: 'Song of Solomon 8:7' }
];

/* ---------- Conversation card decks ----------
   Each prompt is [text, depth] — 1 light, 2 deeper, 3 deepest. */
HTH.DECKS = [
  {
    id: 'life', title: 'Life', emoji: '🌱', color: '#8fd3b0',
    blurb: 'Who you are and what you’re carrying.',
    cards: [
      ['What’s something that made you laugh this week?', 1],
      ['What’s a small thing that instantly makes your day better?', 1],
      ['What song have you had on repeat lately?', 1],
      ['What’s one thing you’d love to learn just for fun?', 1],
      ['What’s something you’ve changed your mind about in the last year?', 2],
      ['What’s a habit you want to build — and one you’d like to break?', 2],
      ['Apart from your parents, who has shaped you the most?', 2],
      ['What does a “good day” look like for you right now?', 2],
      ['What’s something you’re proud of that you rarely talk about?', 2],
      ['If you could redo one decision from the last five years, what would it be?', 2],
      ['What season of life do you feel you’re in — and what is it teaching you?', 3],
      ['What’s a fear that quietly shapes your decisions?', 3],
      ['When do you feel most like yourself?', 3],
      ['What’s something from your childhood that still affects you today?', 3]
    ]
  },
  {
    id: 'faith', title: 'Faith', emoji: '✝️', color: '#f3c27a',
    blurb: 'Your walk with God — together and apart.',
    cards: [
      ['What’s your favourite worship song right now, and why?', 1],
      ['Which Bible story did you love as a kid?', 1],
      ['If you could ask Jesus one question over dinner, what would it be?', 1],
      ['What’s a verse that has carried you through a hard time?', 2],
      ['How did you first come to faith — or when did it become your own?', 2],
      ['What does prayer look like for you on an ordinary day?', 2],
      ['Which person in Scripture do you relate to most?', 2],
      ['What spiritual practice would you like us to try together?', 2],
      ['Who in your life models faith in a way you admire?', 2],
      ['What does rest, or Sabbath, look like for you — and do you get enough of it?', 2],
      ['When have you felt furthest from God — and what brought you back?', 3],
      ['What’s a question about faith you’re still wrestling with?', 3],
      ['What do you sense God has been teaching you this year?', 3],
      ['How do you hope our home reflects our faith?', 3]
    ]
  },
  {
    id: 'us', title: 'Us', emoji: '💞', color: '#ff8fab',
    blurb: 'The two of you — what’s working and what’s next.',
    cards: [
      ['What was your first impression of me — honestly?', 1],
      ['What’s your favourite thing we’ve done together this year?', 1],
      ['What’s a little habit of mine you secretly love?', 1],
      ['If our relationship were a movie, what genre would it be?', 1],
      ['When do you feel most loved by me?', 2],
      ['What’s one way we’ve grown as a couple?', 2],
      ['What’s something I do that makes you feel safe?', 2],
      ['Is there a way I show love that doesn’t quite land for you?', 2],
      ['What tradition would you love for us to start?', 2],
      ['What’s one thing you admire about how I handle hard things?', 2],
      ['What’s something you’ve been afraid to tell me?', 3],
      ['What’s one thing you need from me that you haven’t asked for?', 3],
      ['How do you feel we handle conflict — and what could make it better?', 3],
      ['What does a healthy relationship look like to you, ten years from now?', 3]
    ]
  },
  {
    id: 'dreams', title: 'Dreams', emoji: '✨', color: '#b49cff',
    blurb: 'Where you’re headed and what you hope for.',
    cards: [
      ['If money were no object, where would we travel first?', 1],
      ['What’s on your bucket list that I don’t know about?', 1],
      ['What’s a skill we should learn together?', 1],
      ['Describe our perfect day ten years from now.', 1],
      ['What would you attempt if you knew you couldn’t fail?', 2],
      ['Where do you see us in five years?', 2],
      ['What kind of home do you dream of building with me?', 2],
      ['What’s a dream you’ve let go of — and do you want to pick it back up?', 2],
      ['If we could serve anywhere in the world together, where would it be?', 2],
      ['What’s one goal we could set together for this year?', 2],
      ['What do you want people to say about our life together when we’re old?', 3],
      ['What legacy do you hope we leave?', 3]
    ]
  },
  {
    id: 'memories', title: 'Memory Lane', emoji: '📸', color: '#7cc7ff',
    blurb: 'Your story so far, retold.',
    cards: [
      ['What do you remember most about our first date?', 1],
      ['When did you first know you liked me?', 1],
      ['What’s our funniest memory together?', 1],
      ['What’s a trip or outing you’d love to relive?', 1],
      ['What’s the best gift I’ve ever given you?', 1],
      ['What’s an inside joke we have — and how did it start?', 1],
      ['What’s a moment when you felt really proud of me?', 2],
      ['What’s a hard season we came through together — and what got us through?', 2],
      ['What’s a meal together you’ll never forget?', 2],
      ['When did you first feel like we were a team?', 2],
      ['What surprised you about me once you really got to know me?', 2],
      ['What’s a moment you saw God’s hand in our story?', 3]
    ]
  },
  {
    id: 'fun', title: 'Just for Fun', emoji: '🎈', color: '#ffb36b',
    blurb: 'Light, silly, and perfect for a car ride.',
    cards: [
      ['If we were a famous duo, who would we be?', 1],
      ['What would your walk-up song be?', 1],
      ['What’s the weirdest food combo you secretly enjoy?', 1],
      ['If you could swap lives with me for a day, what would you do first?', 1],
      ['What’s your most useless talent?', 1],
      ['Which fictional world would you want to live in with me?', 1],
      ['What would our reality TV show be called?', 1],
      ['If you could only eat one meal for the rest of your life, what would it be?', 1],
      ['What’s the most embarrassing thing that has happened to you in public?', 1],
      ['If our pet (real or imaginary) could talk, what would it complain about?', 1],
      ['What’s a hill you’d die on that really doesn’t matter?', 1],
      ['Describe me using only three emojis.', 1]
    ]
  }
];

/* ---------- Game: How Well Do You Know Me? ----------
   The answerer picks the option that's true for them; the
   partner then guesses it. */
HTH.KNOWME = [
  { q: 'My perfect Saturday morning?', o: ['Sleep in', 'Big breakfast out', 'A walk or workout', 'Coffee and quiet time'] },
  { q: 'Best way to cheer me up after a hard day?', o: ['A long hug', 'Talk it all through', 'Give me space to recharge', 'Food. Just food.'] },
  { q: 'My dream holiday?', o: ['Beach and sunshine', 'A cabin in the mountains', 'Exploring a big city', 'A long road trip'] },
  { q: 'How do I recharge best?', o: ['Time alone', 'Time with friends', 'Being outdoors', 'Sleep'] },
  { q: 'What makes me feel most loved?', o: ['Kind words', 'Undivided time', 'A thoughtful surprise', 'A helping hand'] },
  { q: 'My favourite part of Sunday?', o: ['Worship', 'The sermon', 'Seeing friends', 'Lunch afterwards'] },
  { q: 'My ideal date night?', o: ['A fancy dinner', 'A movie on the couch', 'Something active', 'Trying something new'] },
  { q: 'The superpower I’d pick?', o: ['Flying', 'Teleporting', 'Reading minds', 'Pausing time'] },
  { q: 'My biggest pet peeve?', o: ['Lateness', 'Loud chewing', 'Mess', 'Being interrupted'] },
  { q: 'Free afternoon, no plans — I’d…', o: ['Nap', 'Read', 'Get outside', 'Watch a show'] },
  { q: 'The Bible character I relate to most?', o: ['Peter — all heart, a bit impulsive', 'Martha — busy doing', 'Mary — sitting at His feet', 'Thomas — needs to see it'] },
  { q: 'Morning person or night owl?', o: ['Up with the sun', 'Night owl', 'Depends on the coffee', 'Honestly, neither'] },
  { q: 'How do I handle conflict?', o: ['Talk it out straight away', 'Need time to cool off', 'Avoid it if I can', 'Think it through first'] },
  { q: 'Where would I most love to live?', o: ['In the city', 'In the suburbs', 'In the countryside', 'By the water'] },
  { q: 'A surprise $1,000 lands in my lap. I…', o: ['Travel', 'Save it', 'Give it away', 'Buy something for home'] },
  { q: 'My favourite season?', o: ['Spring', 'Summer', 'Autumn', 'Winter'] },
  { q: 'The chore I’d happily never do again?', o: ['Dishes', 'Laundry', 'Vacuuming', 'Grocery shopping'] },
  { q: 'The best gift for me?', o: ['Something handmade', 'An experience', 'Something practical', 'A heartfelt note'] },
  { q: 'Where do I feel closest to God?', o: ['In worship', 'In nature', 'In quiet prayer', 'Serving others'] },
  { q: 'My dream birthday?', o: ['A big party', 'Dinner with close friends', 'Just the two of us', 'An adventure'] },
  { q: 'In a group game, I’m the one who…', o: ['Plays to win', 'Makes everyone laugh', 'Explains the rules', 'Is just here for snacks'] },
  { q: 'Movie snack of choice?', o: ['Popcorn', 'Chocolate', 'Chips / crisps', 'Nothing, thanks'] },
  { q: 'What would I rather be doing right now?', o: ['Eating', 'Sleeping', 'Travelling', 'Exactly this'] },
  { q: 'The way I’d spend a rainy day?', o: ['Under a blanket with a book', 'Baking something', 'Movie marathon', 'Walking in it anyway'] }
];

/* ---------- Game: In Sync (this or that) ---------- */
HTH.THISTHAT = [
  ['☕ Coffee', '🍵 Tea'],
  ['🏖️ Beach', '🏔️ Mountains'],
  ['🌅 Sunrise', '🌇 Sunset'],
  ['🐶 Dogs', '🐱 Cats'],
  ['💬 Text', '📞 Call'],
  ['🗓️ Plan it', '🎲 Wing it'],
  ['🍰 Sweet', '🥨 Savoury'],
  ['🛋️ Movie night in', '🍽️ Dinner out'],
  ['😴 Early night', '🌙 Late-night talks'],
  ['📜 Hymns', '🎸 Modern worship'],
  ['📚 Books', '🎧 Podcasts'],
  ['🏙️ City break', '🌲 Nature trip'],
  ['☀️ Summer', '❄️ Winter'],
  ['🥞 Pancakes', '🧇 Waffles'],
  ['👩‍🍳 Cook together', '🛵 Order in'],
  ['🎉 Big party', '🕯️ Small gathering'],
  ['🛌 Sunday nap', '🚶 Sunday walk'],
  ['♟️ Board games', '🎮 Video games'],
  ['🚗 Road trip', '✈️ Fly there'],
  ['💰 Save it', '🛍️ Splurge'],
  ['🍕 Pizza', '🌮 Tacos'],
  ['😂 Comedy', '🎭 Drama'],
  ['🌄 Morning devotions', '🌃 Evening devotions'],
  ['🌊 Ocean', '🏞️ Lake'],
  ['⛺ Camping', '🏨 Hotel'],
  ['🎁 Surprise me', '📝 Tell me the plan'],
  ['🌧️ Rainy day', '🌞 Sunny day'],
  ['📷 Old photos', '🧭 New adventures'],
  ['🍿 Popcorn', '🍫 Chocolate'],
  ['🎤 Karaoke', '💃 Dancing']
];

/* ---------- Game: Couples of the Bible quiz ----------
   a = index of the correct option. */
HTH.QUIZ = [
  { q: 'Who was Isaac’s wife?', o: ['Rebekah', 'Rachel', 'Leah', 'Sarah'], a: 0, ref: 'Genesis 24' },
  { q: 'In total, how many years did Jacob agree to work so he could marry Rachel?', o: ['7', '10', '14', '21'], a: 2, ref: 'Genesis 29' },
  { q: 'Laban tricked Jacob into marrying someone else first. Who?', o: ['Leah', 'Dinah', 'Bilhah', 'Rebekah'], a: 0, ref: 'Genesis 29:23–25' },
  { q: 'Who said, “Whither thou goest, I will go”?', o: ['Naomi', 'Ruth', 'Esther', 'Orpah'], a: 1, ref: 'Ruth 1:16' },
  { q: 'Who did Ruth marry in Bethlehem?', o: ['Obed', 'Jesse', 'Boaz', 'Elimelech'], a: 2, ref: 'Ruth 4' },
  { q: 'Which married couple were tentmakers who worked alongside Paul?', o: ['Ananias & Sapphira', 'Priscilla & Aquila', 'Zechariah & Elizabeth', 'Joseph & Mary'], a: 1, ref: 'Acts 18:2–3' },
  { q: 'Priscilla and Aquila took which eloquent preacher aside to explain the way of God more accurately?', o: ['Timothy', 'Silas', 'Apollos', 'Barnabas'], a: 2, ref: 'Acts 18:26' },
  { q: 'Which couple lied about the price of land they sold?', o: ['Ahab & Jezebel', 'Ananias & Sapphira', 'Abraham & Sarah', 'Felix & Drusilla'], a: 1, ref: 'Acts 5' },
  { q: 'Who were the parents of John the Baptist?', o: ['Zechariah & Elizabeth', 'Joseph & Mary', 'Elkanah & Hannah', 'Amram & Jochebed'], a: 0, ref: 'Luke 1' },
  { q: 'Why couldn’t Zechariah speak until John was born?', o: ['He was ill', 'He took a vow of silence', 'He didn’t believe the angel’s message', 'He was grieving'], a: 2, ref: 'Luke 1:20' },
  { q: 'Where did Jesus perform his first miracle?', o: ['At a funeral in Nain', 'At a wedding in Cana', 'In a synagogue in Capernaum', 'At a feast in Jerusalem'], a: 1, ref: 'John 2:1–11' },
  { q: 'What was the name of the prophet Hosea’s wife?', o: ['Gomer', 'Michal', 'Zipporah', 'Keturah'], a: 0, ref: 'Hosea 1:3' },
  { q: 'Who was Moses’ wife?', o: ['Miriam', 'Zipporah', 'Deborah', 'Jochebed'], a: 1, ref: 'Exodus 2:21' },
  { q: 'Who was Hannah’s husband?', o: ['Eli', 'Elkanah', 'Samuel', 'Elijah'], a: 1, ref: '1 Samuel 1' },
  { q: 'Esther became queen as the wife of which king?', o: ['Nebuchadnezzar', 'Darius', 'Ahasuerus', 'Solomon'], a: 2, ref: 'Esther 2:17' },
  { q: 'Abigail later married David. Who was her first husband?', o: ['Nabal', 'Uriah', 'Saul', 'Jonathan'], a: 0, ref: '1 Samuel 25' },
  { q: 'Which chapter is often called “the love chapter”?', o: ['Psalm 23', 'John 3', 'Romans 8', '1 Corinthians 13'], a: 3, ref: '1 Corinthians 13' },
  { q: 'Ephesians 5 tells husbands to love their wives “even as Christ also loved the…”', o: ['world', 'church', 'disciples', 'lost'], a: 1, ref: 'Ephesians 5:25' },
  { q: 'Love is the first fruit of the Spirit listed in Galatians 5. How many are listed in all?', o: ['5', '7', '9', '12'], a: 2, ref: 'Galatians 5:22–23' },
  { q: 'Which book of the Bible is a collection of love poetry?', o: ['Lamentations', 'Song of Solomon', 'Ecclesiastes', 'Proverbs'], a: 1, ref: 'Song of Solomon' },
  { q: 'Where did Abraham’s servant find Rebekah?', o: ['At a well', 'In the temple', 'At a market', 'In a vineyard'], a: 0, ref: 'Genesis 24' },
  { q: 'What was Sarah’s name before God changed it?', o: ['Sarai', 'Sarita', 'Hagar', 'Milcah'], a: 0, ref: 'Genesis 17:15' },
  { q: 'Jesus healed the mother-in-law of which disciple?', o: ['John', 'Peter', 'Matthew', 'Andrew'], a: 1, ref: 'Matthew 8:14–15' },
  { q: 'Who said “This is now bone of my bones, and flesh of my flesh”?', o: ['Abraham', 'Adam', 'Jacob', 'Boaz'], a: 1, ref: 'Genesis 2:23' },
  { q: 'Who was the wife of Joseph (son of Jacob) in Egypt?', o: ['Asenath', 'Tamar', 'Dinah', 'Potiphera'], a: 0, ref: 'Genesis 41:45' },
  { q: 'Joseph and Mary travelled to Bethlehem for the census from which town?', o: ['Jericho', 'Capernaum', 'Nazareth', 'Bethany'], a: 2, ref: 'Luke 2:4' },
  { q: 'According to 1 Corinthians 13, charity (love) never…', o: ['sleeps', 'fails', 'tires', 'ends'], a: 1, ref: '1 Corinthians 13:8' },
  { q: 'Jesus called “love thy neighbour as thyself” the ___ greatest commandment.', o: ['first', 'second', 'third', 'last'], a: 1, ref: 'Matthew 22:37–39' }
];

/* ---------- Game: Verse Builder (KJV) ---------- */
HTH.BUILD_VERSES = [
  { text: 'We love him, because he first loved us.', ref: '1 John 4:19' },
  { text: 'Two are better than one; because they have a good reward for their labour.', ref: 'Ecclesiastes 4:9' },
  { text: 'Many waters cannot quench love, neither can the floods drown it.', ref: 'Song of Solomon 8:7' },
  { text: 'Whither thou goest, I will go; and where thou lodgest, I will lodge.', ref: 'Ruth 1:16' },
  { text: 'And above all these things put on charity, which is the bond of perfectness.', ref: 'Colossians 3:14' },
  { text: 'Bear ye one another’s burdens, and so fulfil the law of Christ.', ref: 'Galatians 6:2' },
  { text: 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.', ref: '1 Corinthians 13:13' },
  { text: 'This is my commandment, That ye love one another, as I have loved you.', ref: 'John 15:12' },
  { text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.', ref: 'Proverbs 3:5' },
  { text: 'As for me and my house, we will serve the LORD.', ref: 'Joshua 24:15' },
  { text: 'Beloved, let us love one another: for love is of God.', ref: '1 John 4:7' },
  { text: 'And a threefold cord is not quickly broken.', ref: 'Ecclesiastes 4:12' },
  { text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'Let all your things be done with charity.', ref: '1 Corinthians 16:14' },
  { text: 'I am my beloved’s, and my beloved is mine.', ref: 'Song of Solomon 6:3' },
  { text: 'What therefore God hath joined together, let not man put asunder.', ref: 'Mark 10:9' },
  { text: 'A friend loveth at all times.', ref: 'Proverbs 17:17' },
  { text: 'And be ye kind one to another, tenderhearted, forgiving one another.', ref: 'Ephesians 4:32' }
];

/* ---------- Game: Date Night Spinner ---------- */
HTH.DATES = [
  { id: 'in', label: 'Stay In', emoji: '🏠', color: '#ff8fab', ideas: [
    'Cook a recipe from a cuisine neither of you has tried',
    'Build a blanket fort and watch the first movie you saw together',
    'Have an indoor picnic on the living-room floor',
    'Puzzle night with a playlist of “our songs”',
    'No-phones game night — loser makes dessert',
    'Recreate your first date at home'
  ] },
  { id: 'out', label: 'Go Out', emoji: '🌆', color: '#b49cff', ideas: [
    'Try a restaurant neither of you has been to',
    'Go to a local concert or open-mic night',
    'Dessert-only date: hit two dessert spots',
    'Visit a museum or gallery and each pick a favourite piece',
    'Bowling or mini-golf — loser buys the coffee',
    'Browse a bookshop and buy each other a book under $10'
  ] },
  { id: 'adv', label: 'Adventure', emoji: '🧭', color: '#7cc7ff', ideas: [
    'Hike a trail you’ve never done and pack a lunch',
    'Watch the sunrise from somewhere high',
    'Day trip to a town you’ve never visited',
    'Try kayaking, paddle-boarding or a long bike ride',
    'Go stargazing away from the city lights',
    'Take a one-off class together — climbing, dancing, pottery'
  ] },
  { id: 'serve', label: 'Serve', emoji: '🤝', color: '#8fd3b0', ideas: [
    'Volunteer at a food bank or shelter for an afternoon',
    'Cook a meal for a friend who’s going through a lot',
    'Write encouragement notes for your church’s staff or volunteers',
    'Babysit for a couple who needs a date night',
    'Do yard work or errands for an older neighbour',
    'Put together care packs for people experiencing homelessness'
  ] },
  { id: 'faith', label: 'Faith', emoji: '🙏', color: '#f3c27a', ideas: [
    'Take a prayer walk around your neighbourhood',
    'Read a Psalm together and each write your own version',
    'Make a worship playlist and listen on a long drive',
    'Go to a worship night or midweek service together',
    'List answered prayers from the past year and celebrate them',
    'Read a short book of the Bible over coffee — Ruth, Jonah or Philippians'
  ] },
  { id: 'free', label: 'Free & Cheap', emoji: '💸', color: '#ffb36b', ideas: [
    'Walk somewhere new and share one coffee',
    'Write a bucket list together over tea',
    'Find a free outdoor concert or community event',
    'Picnic in the park with whatever’s in the fridge',
    'Look through old photos and tell the stories behind them',
    'Play tourist in your own town'
  ] },
  { id: 'cozy', label: 'Cozy', emoji: '🕯️', color: '#ff9e8a', ideas: [
    'Candles, hot chocolate and the Talk cards in this app',
    'Read aloud to each other from a book you both pick',
    'Write each other letters, then swap and read them',
    'Spa night at home',
    'Movie marathon with themed snacks',
    'Slow breakfast, no plans till noon'
  ] },
  { id: 'make', label: 'Creative', emoji: '🎨', color: '#d6a2ff', ideas: [
    'Paint each other’s portraits — no skill allowed',
    'Write a song or poem about your story',
    'Make a scrapbook page of the last year',
    'Mystery-basket dinner: three random ingredients',
    'Shoot a two-minute film on your phone',
    'Plant something together — herbs, flowers, a tiny garden'
  ] }
];
