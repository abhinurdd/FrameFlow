import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="ff" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF7A1A" />
          <Stop offset="1" stopColor="#FF2E7E" />
        </LinearGradient>
      </Defs>
      <Rect width="40" height="40" rx="11" fill="url(#ff)" />
      <Path d="M14 11.5 L29 20 L14 28.5 Z" fill="#fff" />
      <Path d="M9 15 h4 M8 20 h5 M9 25 h4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity={0.85} />
    </Svg>
  );
}
