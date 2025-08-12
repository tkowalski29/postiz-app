import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { PinterestSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import axios from 'axios';
import FormData from 'form-data';
import { timer } from '@gitroom/helpers/utils/timer';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';

export class PinterestProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'pinterest';
  name = 'Pinterest';
  isBetweenSteps = false;
  scopes = [
    'boards:read',
    'boards:write',
    'pins:read',
    'pins:write',
    'user_accounts:read',
  ];
  override maxConcurrentJob = 3; // Pinterest has more lenient rate limits

  editor = 'normal' as const;

  public override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    if (body.indexOf('cover_image_url or cover_image_content_type') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'When uploading a video, you must add also an image to be used as a cover image.',
      };
    }

    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    console.log('[Pinterest] Refreshing token with sandbox URL');
    const { access_token, expires_in } = await (
      await fetch('https://api-sandbox.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: this.scopes.join(','),
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/pinterest`,
        }),
      })
    ).json();

    console.log('[Pinterest] Getting user account info from sandbox after token refresh');
    const { id, profile_image, username } = await (
      await fetch('https://api-sandbox.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refreshToken,
      expiresIn: expires_in,
      picture: profile_image || '',
      username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: `https://www.pinterest.com/oauth/?client_id=${
        process.env.PINTEREST_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/pinterest`
      )}&response_type=code&scope=${encodeURIComponent(
        'boards:read,boards:write,pins:read,pins:write,user_accounts:read'
      )}&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    console.log('[Pinterest] Authenticating with sandbox URL');
    const { access_token, refresh_token, expires_in, scope } = await (
      await fetch('https://api-sandbox.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/pinterest`,
        }),
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    console.log('[Pinterest] Getting authenticated user account from sandbox');
    const { id, profile_image, username } = await (
      await fetch('https://api-sandbox.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: profile_image,
      username,
    };
  }

  async boards(accessToken: string) {
    console.log('[Pinterest] Using hardcoded boards for sandbox testing');
    
    // Hardcoded test boards for sandbox API
    return [
      {
        name: 'test',
        id: '1010213828854995951',
      },
    ];
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<PinterestSettingsDto>[]
  ): Promise<PostResponse[]> {
    console.log(`[Pinterest] Starting post creation for id: ${id}`);
    console.log(`[Pinterest] Post details:`, JSON.stringify({
      message: postDetails?.[0]?.message,
      board: postDetails?.[0]?.settings?.board,
      mediaCount: postDetails?.[0]?.media?.length,
      mediaTypes: postDetails?.[0]?.media?.map(m => m.path?.split('.').pop())
    }));

    let mediaId = '';
    const findMp4 = postDetails?.[0]?.media?.find(
      (p) => (p.path?.indexOf('mp4') || -1) > -1
    );
    const picture = postDetails?.[0]?.media?.find(
      (p) => (p.path?.indexOf('mp4') || -1) === -1
    );

    console.log(`[Pinterest] Media analysis - hasVideo: ${!!findMp4}, hasImage: ${!!picture}`);

    if (findMp4) {
      try {
        console.log('[Pinterest] Uploading video media to sandbox');
        const mediaResponse = await this.fetch('https://api-sandbox.pinterest.com/v5/media', {
          method: 'POST',
          body: JSON.stringify({
            media_type: 'video',
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
        
        const { upload_url, media_id, upload_parameters } = await mediaResponse.json();
        console.log(`[Pinterest] Got media upload URL: ${upload_url}, media_id: ${media_id}`);

        console.log(`[Pinterest] Downloading video from: ${postDetails?.[0]?.media?.[0]?.path}`);
        const { data, status } = await axios.get(
          postDetails?.[0]?.media?.[0]?.path!,
          {
            responseType: 'stream',
          }
        );
        console.log(`[Pinterest] Video download status: ${status}`);

        const formData = Object.keys(upload_parameters)
          .filter((f) => f)
          .reduce((acc, key) => {
            acc.append(key, upload_parameters[key]);
            return acc;
          }, new FormData());

        formData.append('file', data);
        console.log(`[Pinterest] Uploading video to Pinterest`);
        await axios.post(upload_url, formData);
        console.log(`[Pinterest] Video upload completed`);

        let statusCode = '';
        let attempts = 0;
        const maxAttempts = 10;
        
        while (statusCode !== 'succeeded' && attempts < maxAttempts) {
          console.log(`[Pinterest] Checking media upload status (attempt ${attempts + 1}/${maxAttempts})`);
          const mediafile = await (
            await this.fetch(
              'https://api-sandbox.pinterest.com/v5/media/' + media_id,
              {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
              '',
              0,
              true
            )
          ).json();

          statusCode = mediafile.status;
          console.log(`[Pinterest] Media status: ${statusCode}`);
          
          if (statusCode !== 'succeeded') {
            attempts++;
            if (attempts < maxAttempts) {
              console.log(`[Pinterest] Waiting 30 seconds before next check`);
              await timer(30000);
            }
          }
        }
        
        if (statusCode !== 'succeeded') {
          throw new Error(`Video processing failed after ${maxAttempts} attempts. Last status: ${statusCode}`);
        }

        mediaId = media_id;
        console.log(`[Pinterest] Video processing completed successfully, mediaId: ${mediaId}`);
      } catch (error) {
        console.error(`[Pinterest] Video upload failed:`, error);
        throw error;
      }
    }

    const mapImages = postDetails?.[0]?.media?.map((m) => ({
      path: m.path,
    }));
    console.log(`[Pinterest] Mapped images:`, mapImages);

    const pinData = {
      ...(postDetails?.[0]?.settings.link
        ? { link: postDetails?.[0]?.settings.link }
        : {}),
      ...(postDetails?.[0]?.settings.title
        ? { title: postDetails?.[0]?.settings.title }
        : {}),
      description: postDetails?.[0]?.message,
      ...(postDetails?.[0]?.settings.dominant_color
        ? { dominant_color: postDetails?.[0]?.settings.dominant_color }
        : {}),
      board_id: postDetails?.[0]?.settings.board,
      media_source: mediaId
        ? {
            source_type: 'video_id',
            media_id: mediaId,
            cover_image_url: picture?.path,
          }
        : mapImages?.length === 1
        ? {
            source_type: 'image_url',
            url: mapImages?.[0]?.path,
          }
        : {
            source_type: 'multiple_image_urls',
            items: mapImages,
          },
    };

    console.log('[Pinterest] Creating pin in sandbox with data:', JSON.stringify(pinData, null, 2));
    
    try {
      const pinResponse = await this.fetch('https://api-sandbox.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pinData),
      });
      
      const responseData = await pinResponse.json();
      console.log('[Pinterest] Pin creation response:', JSON.stringify(responseData, null, 2));
      
      const { id: pId } = responseData;
      
      if (!pId) {
        console.error('[Pinterest] No pin ID returned from Pinterest API');
        throw new Error('No pin ID returned from Pinterest API');
      }
      
      const result = [
        {
          id: postDetails?.[0]?.id,
          postId: pId,
          releaseURL: `https://www.pinterest.com/pin/${pId}`,
          status: 'success',
        },
      ];
      
      console.log('[Pinterest] Successfully created pin, returning result:', JSON.stringify(result, null, 2));
      return result;
      
    } catch (error) {
      console.error('[Pinterest] Pin creation failed:', error);
      throw error;
    }
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const until = dayjs().format('YYYY-MM-DD');
    const since = dayjs().subtract(date, 'day').format('YYYY-MM-DD');

    const {
      all: { daily_metrics },
    } = await (
      await fetch(
        `https://api-sandbox.pinterest.com/v5/user_account/analytics?start_date=${since}&end_date=${until}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ).json();

    return daily_metrics.reduce(
      (acc: any, item: any) => {
        if (typeof item.metrics.PIN_CLICK_RATE !== 'undefined') {
          acc[0].data.push({
            date: item.date,
            total: item.metrics.PIN_CLICK_RATE,
          });

          acc[1].data.push({
            date: item.date,
            total: item.metrics.IMPRESSION,
          });

          acc[2].data.push({
            date: item.date,
            total: item.metrics.PIN_CLICK,
          });

          acc[3].data.push({
            date: item.date,
            total: item.metrics.ENGAGEMENT,
          });

          acc[4].data.push({
            date: item.date,
            total: item.metrics.SAVE,
          });
        }

        return acc;
      },
      [
        { label: 'Pin click rate', data: [] as any[] },
        { label: 'Impressions', data: [] as any[] },
        { label: 'Pin Clicks', data: [] as any[] },
        { label: 'Engagement', data: [] as any[] },
        { label: 'Saves', data: [] as any[] },
      ]
    );
  }
}
