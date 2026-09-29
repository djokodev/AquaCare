import { buildDirectionsUrl, buildShareLocationUrl } from '../farmMapLinks';

const mimbomanTerminus = { latitude: 3.8816312, longitude: 11.5487201 };

describe('farmMapLinks', () => {
  it('builds a universal Google Maps directions link to the farm', () => {
    expect(buildDirectionsUrl(mimbomanTerminus)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=3.881631,11.548720'
    );
  });

  it('builds a shareable Google Maps link to the farm', () => {
    expect(buildShareLocationUrl(mimbomanTerminus)).toBe(
      'https://www.google.com/maps/search/?api=1&query=3.881631,11.548720'
    );
  });
});
