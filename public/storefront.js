/* Reveal Stage 4B. Catalogue-driven pages, no exposed paid animations or guessed totals. */
'use strict';
const $ = (tag, opts = {}, children = []) => {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.href) el.href = opts.href;
  if (opts.id) el.id = opts.id;
  if (opts.ariaLabel) el.setAttribute('aria-label',opts.ariaLabel);
  if (opts.role) el.setAttribute('role',opts.role);
  for (const child of children) if (child) el.append(child);
  return el;
};
const emoji = {
  'gifts-surprises':'🎁','trips-travel':'✈️','baby-family':'🍼',
  'love-relationships':'💌','birthdays-celebrations':'🎂',
  'weddings-newlyweds':'💍','big-life-news':'✨',
  'invitations-asks':'💌','results-achievements':'🏆',
  'seasonal':'🎄','custom-reveal':'✦',
  'ticket-reveal':'🎟️','gift-reveal':'🎁',
  'surprise-trip':'🧳','pregnancy-announcement':'🍼',
  'gender-reveal':'🎀','birthday-reveal':'🎈',
  'romantic-proposal':'💍','engagement-reveal':'💎',
  'newlywed-gift':'💝','three-question-quiz':'🧩',
  'reveal-quest':'🗝️'
};
const iconFor = (slug) => emoji[slug] || '✦';
const productLink = (slug) => `/products/${encodeURIComponent(slug)}/`;
const categoryLink = (slug) => `/categories/${encodeURIComponent(slug)}/`;
const elMain = document.getElementById('main');
const params = new URLSearchParams(location.search);
const requestedCurrency = (params.get('currency') || 'gbp').toLowerCase();
const currency = /^[a-z]{3}$/.test(requestedCurrency) ? requestedCurrency : 'gbp';

async function load(path) {
  const sep = path.includes('?')?'&':'?';
  const response = await fetch(path+sep+'currency='+encodeURIComponent(currency),{headers:{'accept':'application/json'}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Catalogue could not be loaded');
  return data;
}
function title(text) {document.title=`${text} | Reveal`}
function breadcrumb(parts=[]) {
  return $('nav',{className:'breadcrumbs',ariaLabel:'Breadcrumb'},[
    $('a',{href:'/',text:'Home'}),...parts.flatMap((part)=>[$('span',{text:' / '}),part.href?$('a',{href:part.href,text:part.text}):$('span',{text:part.text})])
  ]);
}
function pageHeading(eyebrow,heading,copy) {
  return $('div',{className:'page-hero'},[
    $('span',{className:'eyebrow',text:eyebrow}),$('h1',{text:heading}),$('p',{className:'small-copy',text:copy})
  ]);
}
function productCard(product) {
  const tile = $('a',{className:'tile',href:productLink(product.slug)},[
    $('div',{},[$('div',{className:'shape',text:iconFor(product.slug)}),$('h3',{text:product.name}),$('p',{text:product.description || 'Create a moment worth remembering.'})]),
    $('div',{className:'tile-footer'},[
      $('span',{className:'tag'+(product.status==='active'?' active':''),text:product.status==='active'?'Available now':'Coming soon'}),
      $('span',{text:'Explore  ↗'})
    ])
  ]);
  return tile;
}
function categoryCard(category,numberOfProducts) {
  const item = $('a',{className:'tile category',href:categoryLink(category.slug)},[
    $('div',{},[$('div',{className:'shape',text:iconFor(category.slug)}),$('h3',{text:category.name}),
      $('p',{text:category.description || 'Explore thoughtful ways to share a surprise.'})]),
    $('div',{className:'tile-footer'},[$('span',{text:`${numberOfProducts} reveal ${numberOfProducts===1?'idea':'ideas'}`}),$('span',{text:'Explore  ↗'})])
  ]);
  return item;
}
function sectionIntro(kicker,heading,copy) {
  return $('div',{className:'section-header'},[$('div',{},[
    $('span',{className:'eyebrow',text:kicker}),$('h2',{text:heading}),$('p',{className:'small-copy',text:copy})])]);
}
function home(data) {
  title('Make the moment unforgettable');
  const categories = data.categories ?? [];
  const products = data.products ?? [];
  const num = Object.fromEntries(categories.map(c=>[c.slug,products.filter(p=>p.categorySlug===c.slug).length]));
  const features = [...new Map(products.map(p=>[p.slug,p])).values()]
    .filter(p=>['ticket-reveal','gift-reveal','surprise-trip','pregnancy-announcement','reveal-quest','birthday-reveal'].includes(p.slug))
    .sort((a,b)=>(a.status==='active'?-1:1)-(b.status==='active'?-1:1));
  elMain.replaceChildren(
    $('section',{className:'hero'},[
      $('div',{className:'hero-copy'},[
        $('span',{className:'eyebrow',text:'Digital gifts · Real emotions'}),
        $('h1',{text:'Every surprise deserves a moment.'}),
        $('p',{className:'lede',text:'Turn a gift, special trip, event ticket or life announcement into something they will remember. Personalise it. Reveal it. Share the magic.'}),
        $('div',{},[$('a',{className:'button',href:'#browse',text:'Explore reveals  ↗'})])
      ]),
      $('div',{className:'hero-art',ariaLabel:'Decorative illustrated gift box'},[
        $('div',{className:'gift-illustration'},[
          $('span',{className:'glow g1',text:'✧'}),$('span',{className:'glow g2',text:'✦'}),
          $('span',{className:'gift-box'}),$('span',{className:'ribbon',text:'∞'}),$('span',{className:'glow g3',text:'✧'})
        ])
      ])
    ]),
    $('section',{className:'section',id:'browse'},[
      sectionIntro('Find the perfect moment','Browse by occasion','A different reveal for every milestone, surprise and celebration.'),
      $('div',{className:'grid'},categories.map(c=>categoryCard(c,num[c.slug]||0)))
    ]),
    $('section',{className:'section'},[
      sectionIntro('Hand-picked reveal ideas','Start with something special','Explore our first products. New interactive experiences are being added.'),
      $('div',{className:'grid'},features.map(productCard))
    ]),
    $('section',{className:'steps'},[
      $('div',{className:'section'},[
        sectionIntro('A simple way to surprise','Create. Pay. Share.','A personalised surprise, ready to revisit.'),
        $('div',{className:'steps-grid'},[
          ['01','Choose your reveal','Pick an occasion and an experience. Choose the details that make it yours.'],
          ['02','Review and pay','Check a static summary before secure checkout. The full animation stays locked until payment.'],
          ['03','Share the moment','Send a private link that can be revisited, with keepsakes planned for supported experiences.']
        ].map(([n,h,p])=>$('div',{},[$('span',{className:'step-num',text:n}),$('h3',{text:h}),$('p',{text:p})])))
      ])
    ]),
    $('section',{className:'section'},[
      $('div',{className:'feature'},[$('div',{},[
        $('span',{className:'eyebrow',text:'Coming soon'}),$('h2',{text:'Unlock something extraordinary.'}),
        $('p',{text:'Reveal Quest turns a surprise into a themed adventure. Personalise the clues and unlock the final reveal step by step.'})]),
        $('a',{className:'button light',href:productLink('reveal-quest'),text:'Discover Reveal Quest  ↗'})])
    ])
  );
}
async function categoryPage(slug) {
  const data=await load('/api/catalogue/categories/'+encodeURIComponent(slug));
  title(data.category.name);
  elMain.replaceChildren($('div',{className:'page'},[
    breadcrumb([{text:'Categories',href:'/#browse'},{text:data.category.name}]),
    pageHeading('Explore by occasion',data.category.name,data.category.description || 'Choose a unique experience to make the moment memorable.'),
    $('div',{className:'grid'},(data.products||[]).map(productCard))
  ]));
}
function priceText(price) {
  if (!price || !Number.isInteger(price.amount_minor) || price.amount_minor<0) return null;
  try {
    const digits = ['jpy','krw','vnd','clp'].includes(price.currency.toLowerCase()) ? 0 : 2;
    return new Intl.NumberFormat('en-GB',{style:'currency',currency:price.currency.toUpperCase(),minimumFractionDigits:digits,maximumFractionDigits:digits}).format(price.amount_minor/(10**digits));
  } catch {return null}
}
async function productPage(slug) {
  const data=await load('/api/catalogue/products/'+encodeURIComponent(slug));
  const p=data.product;
  title(p.name);
  const ready = data.canCreate === true;
  const isStaging = location.hostname === 'reveal-stage4b-test.michael-fenton9.workers.dev';
  const canTestTicketCreator = isStaging && p.slug === 'ticket-reveal' && !ready;
  const canTestQuizCreator = isStaging && p.slug === 'three-question-quiz' && !ready;
  const canTestGenderCreator = isStaging && p.slug === 'gender-reveal' && !ready;
  const mechanics = data.mechanics||[],themes=data.themes||[];
  const price = priceText(data.price);
  const parent = data.categories?.[0];
  const intro = p.slug==='reveal-quest'?'Choose a theme, personalise the clues and solve a sequence of puzzles to unlock the final surprise.':
    p.slug==='three-question-quiz'?'Three personalised questions, one exciting final reveal. A simple interactive way to surprise someone.':
    p.slug==='gender-reveal'?'One audience link for everyone. Guests guess Boy or Girl and watch live totals until the creator opens the five-second countdown.':p.description;
  const box = $('aside',{className:'purchase'},[
    $('span',{className:'tag'+(ready?' active':''),text:ready?'Available now':'Coming soon'}),
    $('h3',{text:ready?'Make it your own':'An exciting reveal is on its way'}),
    $('p',{text:ready?(price?`Base price: ${price} before any applicable tax.`:'The price is confirmed at checkout.'):'This product is not available to purchase yet.'}),
    ready ? $('a',{className:'button',href:'/create/ticket-reveal',text:'Create this reveal  ↗'}) :
      canTestTicketCreator ? $('a',{className:'button',href:'/legacy-create',text:'Test creator in staging  ↗'}) :
      canTestQuizCreator ? $('a',{className:'button',href:'/quiz-create',text:'Test three-question quiz creator  ↗'}) :
      canTestGenderCreator ? $('a',{className:'button',href:'/gender-create',text:'Test group Gender Reveal creator  ↗'}) :
      $('a',{className:'button',href:'/#browse',text:'Browse available reveals  ↗'}),
    $('p',{text:ready?'The final payable total and local currency are shown securely in Stripe Checkout. No subscription.':
      canTestTicketCreator||canTestQuizCreator||canTestGenderCreator?'Staging test only. You can create and review a draft, but checkout is disabled and no reveal can be purchased or shared. Please use fictional test details.':
      'There is no payment or pre-purchase access for this product.'})
  ]);
  elMain.replaceChildren($('div',{className:'page'},[
    breadcrumb([...(parent?[{text:parent.name,href:categoryLink(parent.slug)}]:[]),{text:p.name}]),
    pageHeading('A Reveal experience',p.name,intro),
    $('div',{className:'product-layout'},[
      $('div',{className:'detail'},[
        $('div',{className:'product-visual',text:iconFor(p.slug)}),
        isStaging && p.slug === 'ticket-reveal' ? $('a',{className:'button',href:'/legacy-create?variant=concert',text:'Try the Scratch Concert Ticket creator  ↗'}) : null,
        isStaging && p.slug === 'ticket-reveal' ? $('a',{className:'button',href:'/scratch-demo',text:'Try the fictional scratch-card demo  ↗'}) : null,
        isStaging && p.slug === 'three-question-quiz' ? $('a',{className:'button',href:'/quiz-demo',text:'Try the fictional recipient quiz  ↗'}) : null,
        isStaging && p.slug === 'gender-reveal' ? $('a',{className:'button',href:'/gender-demo',text:'Try the fictional group voting and reveal  ↗'}) : null,
        $('h2',{text:'How this reveal works'}),
        $('p',{className:'product-copy',text:ready?'Personalise the ticket information, review the details and continue to secure payment. Your recipient sees the animated experience only after payment has been confirmed.':
            p.slug==='reveal-quest'?'The purchaser selects a story theme and uses ready-made, adaptable or fully custom clues. The recipient solves each clue in sequence to unlock the final paid reveal.':
            p.slug==='three-question-quiz'?'Write exactly three questions with four choices each, choose the correct answer and an optional hint. The recipient answers each question once payment is verified and unlocks a revisitable surprise after three correct answers.':
            p.slug==='gender-reveal'?'One paid audience link is sent to all guests. Each guest chooses Boy or Girl and everyone sees live totals. Only the creator may open the reveal: voting closes, a shared five-second countdown starts and the result appears for everyone.':'This planned product will use a personalised, mobile-friendly create, review and unlock journey.'}),
        $('ul',{},[
          $('li',{text:`Reveal style: ${mechanics.map(m=>m.name).join(', ')||'To be confirmed'}`}),
          $('li',{text:`Design theme: ${themes.map(t=>t.name).join(', ')||'To be confirmed'}`}),
          $('li',{text:'Full reveal stays locked before successful payment.'}),
          $('li',{text:'The paid share link can be revisited.'})
        ])
      ]),box
    ])
  ]));
}
function showError(error) {
  title('Something went wrong');
  elMain.replaceChildren($('section',{className:'page'},[
    breadcrumb([]),$('h1',{text:'We couldn’t load this page'}),
    $('p',{className:'message',text:error.message || 'Please try again shortly.'}),
    $('a',{className:'button',href:'/',text:'Return home'})
  ]));
}
async function boot() {
  const menu=document.getElementById('menu-button'),nav=document.getElementById('main-nav');
  menu.addEventListener('click',()=>{
    const isOpen=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(isOpen));
  });
  nav.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false')});
  const bits=location.pathname.split('/').filter(Boolean);
  try {
    if (bits[0]==='categories' && bits[1]) await categoryPage(bits[1]);
    else if (bits[0]==='products' && bits[1]) await productPage(bits[1]);
    else if (bits[0]==='reveal-quest') await productPage('reveal-quest');
    else if (bits[0]==='three-question-quiz') await productPage('three-question-quiz');
    else home(await load('/api/catalogue'));
  } catch(e) {showError(e)}
}
boot();
