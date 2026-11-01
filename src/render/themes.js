// Each dream's light and colour: sky, fog, water, banks, the moon (or the sun).

export const THEMES = {
  bedtime: {
    skyTop: '#070b24', skyMid: '#18225a', skyBot: '#34417e', fog: '#1a2352', fogD: 0.0105,
    deep: '#0a1131', water: '#22367a', foam: '#dfe6ff',
    bank: ['#4b3529', '#5e4332', '#3b2a22'], far: '#241a26',
    moon: { dir: [-0.35, 0.42, -1], color: '#c3cdff', intensity: 1.35, size: 70 },
    hemi: ['#4d5aa8', '#0b0b18', 0.75], lantern: '#FFB547', stars: 0.8,
  },
  teatime: {
    skyTop: '#0b0d2c', skyMid: '#26265e', skyBot: '#5a3d6e', fog: '#2c2758', fogD: 0.0095,
    deep: '#0d1236', water: '#2a3d82', foam: '#f1e8ff',
    bank: ['#d8c7ad', '#b76073', '#cdb99c'], far: '#2a2240',
    moon: { dir: [0.5, 0.45, -1], color: '#d2cdf7', intensity: 1.3, size: 60 },
    hemi: ['#6a5ab0', '#120c18', 0.8], lantern: '#FFB547', stars: 0.7,
  },
  staircase: {
    skyTop: '#060a22', skyMid: '#151d50', skyBot: '#2c356c', fog: '#1d2550', fogD: 0.015,
    deep: '#091030', water: '#203372', foam: '#e0e6ff',
    bank: ['#2c3150', '#3a4066', '#252a44'], far: '#161b38',
    moon: { dir: [-0.6, 0.5, -1], color: '#bcc8ff', intensity: 1.25, size: 55 },
    hemi: ['#4a58a8', '#090a16', 0.7], lantern: '#FFC266', stars: 0.6,
  },
  cloudbank: {
    skyTop: '#16205a', skyMid: '#3c4a94', skyBot: '#7d88c4', fog: '#56609f', fogD: 0.021,
    deep: '#1a2560', water: '#3a50a0', foam: '#ffffff',
    bank: ['#d9def4', '#b8c0e2', '#eef0fb'], far: '#7880b8',
    moon: { dir: [0.2, 0.6, -1], color: '#dfe4ff', intensity: 1.45, size: 80 },
    hemi: ['#8f9ae0', '#2a2f5a', 0.95], lantern: '#FFB547', stars: 0.3,
  },
  library: {
    skyTop: '#0c0a1e', skyMid: '#2a1d36', skyBot: '#4c2e3c', fog: '#2b1d30', fogD: 0.0115,
    deep: '#0d0f2a', water: '#283670', foam: '#f3e6d6',
    bank: ['#6a2f34', '#7d3a36', '#55252b'], far: '#25161f',
    moon: { dir: [-0.3, 0.55, -1], color: '#ffd9a8', intensity: 1.0, size: 45 },
    hemi: ['#7a5a8a', '#0e0808', 0.75], lantern: '#FFB547', stars: 0.35,
  },
  clockwork: {
    skyTop: '#080b22', skyMid: '#1e2148', skyBot: '#4a4258', fog: '#272848', fogD: 0.011,
    deep: '#0a102e', water: '#24376f', foam: '#f2ead2',
    bank: ['#6a5634', '#7d6740', '#4d3e28'], far: '#1e1a26',
    moon: { dir: [0.45, 0.5, -1], color: '#d6d2ff', intensity: 1.3, size: 62 },
    hemi: ['#5a5aa0', '#0d0a0a', 0.75], lantern: '#FFC266', stars: 0.6,
  },
  stars: {
    skyTop: '#02031a', skyMid: '#0a0e3a', skyBot: '#1a2366', fog: '#0d1240', fogD: 0.0075,
    deep: '#03051c', water: '#0e1650', foam: '#cfd8ff',
    bank: ['#141a44', '#1c2456', '#0c1032'], far: '#070a24',
    moon: { dir: [0.0, 0.35, -1], color: '#b7c2ff', intensity: 1.1, size: 85, below: true },
    hemi: ['#3a48a0', '#05061a', 0.65], lantern: '#FFB547', stars: 1.6,
  },
  morning: {
    skyTop: '#2b3a80', skyMid: '#8a7aa8', skyBot: '#f4b48a', fog: '#a07a98', fogD: 0.0062, exposure: 0.56, bloomT: 1.25, sat: 1.12,
    deep: '#1f2f6e', water: '#4a62a8', foam: '#fff4e6',
    bank: ['#c46e64', '#e2b46a', '#8fb39a', '#7f8cc4'], far: '#6a5070',
    moon: { dir: [0.0, 0.12, -1], color: '#ffcf9e', intensity: 2.1, size: 110, sun: true },
    hemi: ['#f2c2b0', '#3a2a40', 1.05], lantern: '#FFB547', stars: 0,
  },
};

export const themeOf = (id) => THEMES[id] ?? THEMES.bedtime;
