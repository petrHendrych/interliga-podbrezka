import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

export const alt = 'Interliga Podbrezová';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const readAsset = (name: string) => readFile(join(process.cwd(), 'assets', name));

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [dict, extraBold, semiBold, mark] = await Promise.all([
    getDictionary(lang as Locale),
    readAsset('Montserrat-ExtraBold.ttf'),
    readAsset('Montserrat-SemiBold.ttf'),
    readAsset('brand-mark.svg'),
  ]);

  const markSrc = `data:image/svg+xml;base64,${mark.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: 'linear-gradient(150deg, #141c30 0%, #020618 70%)',
          fontFamily: 'Montserrat',
          color: '#fafafa',
        }}
      >
        {/* Oversized, barely-there repeat of the mark, bled off the right edge. */}
        <img
          src={markSrc}
          alt=""
          width={560}
          height={560}
          style={{
            position: 'absolute',
            top: 35,
            right: -150,
            opacity: 0.07,
          }}
        />
        <img src={markSrc} alt="" width={132} height={132} style={{ marginBottom: 28 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 80,
            fontWeight: 800,
            letterSpacing: '0.1em',
            lineHeight: 1.05,
          }}
        >
          <div>INTERLIGA</div>
          <div>PODBREZOVÁ</div>
        </div>
        <div
          style={{
            width: 460,
            height: 4,
            margin: '40px 0 32px',
            borderRadius: 2,
            background: 'linear-gradient(to right, #4ade80, rgba(74, 222, 128, 0))',
          }}
        />
        <div style={{ fontSize: 34, fontWeight: 600, color: '#99a1af' }}>
          {dict.home.pageDescription}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Montserrat', data: extraBold, style: 'normal', weight: 800,
        },
        {
          name: 'Montserrat', data: semiBold, style: 'normal', weight: 600,
        },
      ],
    },
  );
}
