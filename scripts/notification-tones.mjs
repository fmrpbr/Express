const sampleRate = 22050;

function toneWave(seconds, sample) {
  const samples = Math.floor(sampleRate * seconds);
  const wave = Buffer.alloc(44 + samples * 2);
  wave.write('RIFF');
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    wave.writeInt16LE(Math.round(sample(index / sampleRate)), 44 + index * 2);
  }
  return wave;
}

export function standardAlertTone() {
  const frequencies = [784, 988, 1175];
  return toneWave(1.05, time => {
    const slot = Math.floor(time / 0.35);
    const within = time - slot * 0.35;
    const envelope = within < 0.27 ? Math.min(within / 0.015, 1) * Math.max(0, 1 - within / 0.27) : 0;
    const frequency = frequencies[Math.min(slot, 2)];
    return Math.sin(2 * Math.PI * frequency * time) * envelope * 15000;
  });
}

export function courierOfferTone() {
  const pulses = [[0, 880], [0.26, 1220], [0.52, 880], [0.96, 1220], [1.22, 880]];
  const length = 0.17;
  return toneWave(1.48, time => {
    const pulse = pulses.find(([start]) => time >= start && time < start + length);
    if (!pulse) return 0;
    const [start, frequency] = pulse;
    const within = time - start;
    const envelope = Math.min(within / 0.012, (length - within) / 0.045, 1);
    const phase = 2 * Math.PI * frequency * within;
    return (0.75 * Math.sin(phase) + 0.25 * Math.sin(phase * 2)) * envelope * 31000;
  });
}
