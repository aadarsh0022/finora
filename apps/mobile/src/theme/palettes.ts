import type { AccentColor } from '@finora/contracts';

interface Tone {
  accent: string;
  accentSoft: string;
  onAccent: string;
  heroFrom: string;
  heroMid: string;
  heroTo: string;
  glow: string;
}
export interface Palette {
  label: string;
  /** Page background and divider tints, so each theme feels coherent rather than only recoloured. */
  background: string;
  border: string;
  light: Tone;
  dark: Tone;
  /** Logo mark gradient: bright, light, deep and pale stops. */
  brand: [string, string, string, string];
}

export const palettes: Record<AccentColor, Palette> = {
  green: {
    label: 'Green',
    background: '#F7F9FA',
    border: '#EDF0F2',
    light: {
      accent: '#087E62',
      accentSoft: '#E5F7EE',
      onAccent: '#FFFFFF',
      heroFrom: '#0A5C45',
      heroMid: '#0E8A62',
      heroTo: '#18B38A',
      glow: '#B8F5DC',
    },
    dark: {
      accent: '#5BD29C',
      accentSoft: '#203C2D',
      onAccent: '#10251A',
      heroFrom: '#0F5A43',
      heroMid: '#0F7A58',
      heroTo: '#16A07C',
      glow: '#7CF0C0',
    },
    brand: ['#009368', '#79DCAE', '#00835F', '#B1EBCB'],
  },
  orange: {
    label: 'Orange',
    background: '#FAF8F5',
    border: '#F0EAE3',
    light: {
      accent: '#D9480F',
      accentSoft: '#FFEFE4',
      onAccent: '#FFFFFF',
      heroFrom: '#C9420B',
      heroMid: '#E5601C',
      heroTo: '#F59E3B',
      glow: '#FFD6A0',
    },
    dark: {
      accent: '#FF9A5C',
      accentSoft: '#4A2412',
      onAccent: '#2A1000',
      heroFrom: '#8F3208',
      heroMid: '#B5461A',
      heroTo: '#D9782A',
      glow: '#FFB27A',
    },
    brand: ['#D9480F', '#FFB27A', '#B83A08', '#FFE3D0'],
  },
  purple: {
    label: 'Purple',
    background: '#F8F7FC',
    border: '#ECE9F5',
    light: {
      accent: '#6D3FD1',
      accentSoft: '#F0EAFC',
      onAccent: '#FFFFFF',
      heroFrom: '#4B2A9E',
      heroMid: '#6D3FD1',
      heroTo: '#B65CF0',
      glow: '#E3C4FF',
    },
    dark: {
      accent: '#B79CFF',
      accentSoft: '#2E2552',
      onAccent: '#1A0F3D',
      heroFrom: '#3B2380',
      heroMid: '#5634B0',
      heroTo: '#8E48D0',
      glow: '#C7A4FF',
    },
    brand: ['#5B33BD', '#B79CFF', '#4A2799', '#E3D8FF'],
  },
  blue: {
    label: 'Blue',
    background: '#F5F8FC',
    border: '#E7ECF4',
    light: {
      accent: '#1D5FD6',
      accentSoft: '#E7F0FD',
      onAccent: '#FFFFFF',
      heroFrom: '#154BAE',
      heroMid: '#2A6FE0',
      heroTo: '#36C6F0',
      glow: '#BDEBFF',
    },
    dark: {
      accent: '#7FB0FF',
      accentSoft: '#1B2F52',
      onAccent: '#0B1D3D',
      heroFrom: '#16408F',
      heroMid: '#2257C2',
      heroTo: '#2AA3D0',
      glow: '#8FD8FF',
    },
    brand: ['#1D5FD6', '#8DB8FF', '#154BAE', '#D6E6FF'],
  },
  teal: {
    label: 'Teal',
    background: '#F4F9F9',
    border: '#E3EEEE',
    light: {
      accent: '#0B7F8A',
      accentSoft: '#E2F5F6',
      onAccent: '#FFFFFF',
      heroFrom: '#0A5F69',
      heroMid: '#0E8A94',
      heroTo: '#2DD4BF',
      glow: '#B5F5EC',
    },
    dark: {
      accent: '#4FD1DC',
      accentSoft: '#16373B',
      onAccent: '#06262A',
      heroFrom: '#0A4F58',
      heroMid: '#0D737C',
      heroTo: '#22AFA0',
      glow: '#7FE8DA',
    },
    brand: ['#0B7F8A', '#7FE0E8', '#0A5F69', '#D2F3F5'],
  },
  rose: {
    label: 'Rose',
    background: '#FBF6F8',
    border: '#F2E6EB',
    light: {
      accent: '#C2255C',
      accentSoft: '#FCE8EF',
      onAccent: '#FFFFFF',
      heroFrom: '#A31A4A',
      heroMid: '#D6336C',
      heroTo: '#FF8A5B',
      glow: '#FFD0C2',
    },
    dark: {
      accent: '#FF8FB4',
      accentSoft: '#4A1B2E',
      onAccent: '#3A0A1C',
      heroFrom: '#7E1538',
      heroMid: '#AE2557',
      heroTo: '#D9634A',
      glow: '#FFA9B8',
    },
    brand: ['#C2255C', '#FFA8C5', '#A31A4A', '#FFDCE8'],
  },
};
