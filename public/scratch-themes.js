/** Reveal-owned original scratch themes; no third-party image assets. */
export const SCRATCH_THEMES = Object.freeze([
  {
    "id": "adventure",
    "label": "Adventure",
    "description": "Compass, trails & exploration",
    "icon": "🧭",
    "bg": "#221910",
    "bg2": "#50351c",
    "accent": "#b47d30",
    "highlight": "#f2ca7a",
    "paper": "#f4e8cf",
    "motif": "✧"
  },
  {
    "id": "travel",
    "label": "Travel",
    "description": "Passports, destinations & journeys",
    "icon": "✈",
    "bg": "#132b3c",
    "bg2": "#24596d",
    "accent": "#3c94a7",
    "highlight": "#b8eaf0",
    "paper": "#e6f3f1",
    "motif": "✈"
  },
  {
    "id": "magical",
    "label": "Magical",
    "description": "Enchanted starlight & wonder",
    "icon": "✦",
    "bg": "#201339",
    "bg2": "#54368b",
    "accent": "#8d65d3",
    "highlight": "#eed6ff",
    "paper": "#efe5fa",
    "motif": "✦"
  },
  {
    "id": "sports",
    "label": "Sports",
    "description": "Stadium lights & sporting energy",
    "icon": "★",
    "bg": "#122b24",
    "bg2": "#26634a",
    "accent": "#52a979",
    "highlight": "#d8ffba",
    "paper": "#e5f2e5",
    "motif": "★"
  },
  {
    "id": "music",
    "label": "Music",
    "description": "Concert lighting & soundwaves",
    "icon": "♫",
    "bg": "#18132e",
    "bg2": "#533079",
    "accent": "#b259d2",
    "highlight": "#f7c4ff",
    "paper": "#efe7fa",
    "motif": "♫"
  },
  {
    "id": "theatre",
    "label": "Theatre",
    "description": "Velvet curtains & golden spotlights",
    "icon": "♛",
    "bg": "#3d1125",
    "bg2": "#83234c",
    "accent": "#bc6a85",
    "highlight": "#ffe1b2",
    "paper": "#f8e7ed",
    "motif": "✦"
  },
  {
    "id": "festive",
    "label": "Festive",
    "description": "Winter sparkle & seasonal magic",
    "icon": "❄",
    "bg": "#12382e",
    "bg2": "#286b57",
    "accent": "#73b099",
    "highlight": "#ffdd9c",
    "paper": "#e5f2eb",
    "motif": "❄"
  },
  {
    "id": "romance",
    "label": "Romance",
    "description": "Roses, candlelight & hearts",
    "icon": "♥",
    "bg": "#421d33",
    "bg2": "#8f4768",
    "accent": "#d68eac",
    "highlight": "#ffe4dd",
    "paper": "#f9e9ef",
    "motif": "♥"
  },
  {
    "id": "birthday",
    "label": "Birthday",
    "description": "Balloons, ribbons & joyful confetti",
    "icon": "✺",
    "bg": "#3f235d",
    "bg2": "#8d55b4",
    "accent": "#edab51",
    "highlight": "#ffdc91",
    "paper": "#faecfa",
    "motif": "✺"
  },
  {
    "id": "baby",
    "label": "Baby",
    "description": "Clouds, soft stars & pastels",
    "icon": "☁",
    "bg": "#334259",
    "bg2": "#88a5c1",
    "accent": "#ddacbf",
    "highlight": "#fff1de",
    "paper": "#f1f3fa",
    "motif": "☁"
  },
  {
    "id": "celebration",
    "label": "Celebration",
    "description": "Fireworks, sparkle & party lights",
    "icon": "✹",
    "bg": "#242452",
    "bg2": "#544f99",
    "accent": "#d9a654",
    "highlight": "#fff2aa",
    "paper": "#eaeafa",
    "motif": "✹"
  },
  {
    "id": "mystery",
    "label": "Mystery",
    "description": "Hidden symbols & secret discoveries",
    "icon": "◇",
    "bg": "#182a30",
    "bg2": "#38565b",
    "accent": "#a28754",
    "highlight": "#efdeb3",
    "paper": "#e5efed",
    "motif": "◇"
  },
  {
    "id": "luxury-elegant",
    "label": "Luxury / Elegant",
    "description": "Marble, satin & refined gold",
    "icon": "◆",
    "bg": "#171c25",
    "bg2": "#393c4b",
    "accent": "#b99659",
    "highlight": "#f5e5c6",
    "paper": "#f3efe5",
    "motif": "◆"
  }
].map(theme=>Object.freeze(theme)));
const byId=new Map(SCRATCH_THEMES.map(theme=>[theme.id,theme]));
export const DEFAULT_SCRATCH_THEME='luxury-elegant';
export const getScratchTheme=id=>byId.get(id)||byId.get(DEFAULT_SCRATCH_THEME);
export function applyScratchTheme(root,id,mode='creator'){
 const theme=getScratchTheme(id),body=root.body;
 body.dataset.scratchTheme=theme.id;
 body.classList.add('scratch-themed');
 body.dataset.scratchThemeMode=mode;
 const values={'--scratch-bg':theme.bg,'--scratch-bg2':theme.bg2,
  '--scratch-accent':theme.accent,'--scratch-highlight':theme.highlight,
  '--scratch-paper':theme.paper,'--scratch-icon':JSON.stringify(theme.motif)};
 for(const [key,value]of Object.entries(values))body.style.setProperty(key,value);
 return theme;
}
export function makeScratchThemePicker(root,id='luxury-elegant',change=()=>{}){
 const wrap=root.createElement('div');
 wrap.className='scratch-theme-grid';
 wrap.setAttribute('role','group');
 wrap.setAttribute('aria-label','Scratch card theme');
 for(const theme of SCRATCH_THEMES){
  const button=root.createElement('button');
  button.type='button';button.className='scratch-theme-option';
  button.dataset.scratchTheme=theme.id;
  button.setAttribute('aria-pressed',String(id===theme.id));
  button.style.setProperty('--tile-bg',theme.bg);
  button.style.setProperty('--tile-bg2',theme.bg2);
  button.style.setProperty('--tile-accent',theme.accent);
  const icon=root.createElement('span');icon.className='scratch-theme-icon';icon.textContent=theme.icon;icon.setAttribute('aria-hidden','true');
  const name=root.createElement('strong');name.textContent=theme.label;
  const subtitle=root.createElement('small');subtitle.textContent=theme.description;
  button.append(icon,name,subtitle);
  button.addEventListener('click',()=>change(theme.id));
  wrap.append(button);
 }
 return wrap;
}
