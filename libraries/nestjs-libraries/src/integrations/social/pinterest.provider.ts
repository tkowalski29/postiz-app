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
import { SocialAbstract, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
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

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    console.log('=== Pinterest Refresh Token Start ===');
    console.log('Refresh token (first 20 chars):', refreshToken.substring(0, 20) + '...');
    
    const { access_token, expires_in } = await (
      await this.fetch('https://api-sandbox.pinterest.com/v5/oauth/token', {
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

    console.log('Token refresh successful');
    console.log('New access token (first 20 chars):', access_token.substring(0, 20) + '...');
    console.log('Expires in:', expires_in);

    const { id, profile_image, username } = await (
      await this.fetch('https://api-sandbox.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    console.log('User account info retrieved');
    console.log('User ID:', id);
    console.log('Username:', username);
    console.log('Profile image:', profile_image ? 'Present' : 'Not present');

    const result = {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refreshToken,
      expiresIn: expires_in,
      picture: profile_image,
      username,
    };

    console.log('=== Pinterest Refresh Token Success ===');
    console.log('Final result:', {
      id: result.id,
      name: result.name,
      accessToken: result.accessToken.substring(0, 20) + '...',
      refreshToken: result.refreshToken.substring(0, 20) + '...',
      expiresIn: result.expiresIn,
      username: result.username
    });

    return result;
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
    console.log('=== Pinterest Authenticate Start ===');
    console.log('Code (first 20 chars):', params.code.substring(0, 20) + '...');
    console.log('Code verifier (first 20 chars):', params.codeVerifier.substring(0, 20) + '...');
    
    const { access_token, refresh_token, expires_in, scope } = await (
      await this.fetch('https://api-sandbox.pinterest.com/v5/oauth/token', {
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

    console.log('OAuth token exchange successful');
    console.log('Access token (first 20 chars):', access_token.substring(0, 20) + '...');
    console.log('Refresh token (first 20 chars):', refresh_token.substring(0, 20) + '...');
    console.log('Expires in:', expires_in);
    console.log('Scope:', scope);

    this.checkScopes(this.scopes, scope);

    const { id, profile_image, username } = await (
      await this.fetch('https://api-sandbox.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    console.log('User account info retrieved');
    console.log('User ID:', id);
    console.log('Username:', username);
    console.log('Profile image:', profile_image ? 'Present' : 'Not present');

    const result = {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: profile_image,
      username,
    };

    console.log('=== Pinterest Authenticate Success ===');
    console.log('Final result:', {
      id: result.id,
      name: result.name,
      accessToken: result.accessToken.substring(0, 20) + '...',
      refreshToken: result.refreshToken.substring(0, 20) + '...',
      expiresIn: result.expiresIn,
      username: result.username
    });

    return result;
  }

  async boards(accessToken: string) {
    console.log('=== Pinterest Boards Start ===');
    console.log('Access token (first 20 chars):', accessToken.substring(0, 20) + '...');
    
    const { items } = await (
      await this.fetch('https://api-sandbox.pinterest.com/v5/boards', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    console.log('Boards retrieved successfully');
    console.log('Number of boards:', items?.length || 0);
    console.log('Boards:', items?.map((item: any) => ({ name: item.name, id: item.id })) || []);

    const result = (
      items?.map((item: any) => ({
        name: item.name,
        id: item.id,
      })) || []
    );

    console.log('=== Pinterest Boards Success ===');
    console.log('Final result:', result);

    return result;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<PinterestSettingsDto>[]
  ): Promise<PostResponse[]> {
    console.log('=== Pinterest Post Start ===');
    console.log('Post ID:', id);
    console.log('Access Token (first 20 chars):', accessToken.substring(0, 20) + '...');
    console.log('Post Details:', JSON.stringify(postDetails, null, 2));

    let mediaId = '';
    const findMp4 = postDetails?.[0]?.media?.find(
      (p) => (p.path?.indexOf('mp4') || -1) > -1
    );
    const picture = postDetails?.[0]?.media?.find(
      (p) => (p.path?.indexOf('mp4') || -1) === -1
    );

    console.log('Found MP4:', findMp4 ? 'Yes' : 'No');
    console.log('Found Picture:', picture ? 'Yes' : 'No');

    if (findMp4) {
      console.log('=== Processing Video Upload ===');
      const { upload_url, media_id, upload_parameters } = await (
        await this.fetch('https://api-sandbox.pinterest.com/v5/media', {
          method: 'POST',
          body: JSON.stringify({
            media_type: 'video',
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        })
      ).json();

      console.log('Video upload URL:', upload_url);
      console.log('Media ID:', media_id);
      console.log('Upload parameters:', upload_parameters);

      const { data, status } = await axios.get(
        postDetails?.[0]?.media?.[0]?.path!,
        {
          responseType: 'stream',
        }
      );

      const formData = Object.keys(upload_parameters)
        .filter((f) => f)
        .reduce((acc, key) => {
          acc.append(key, upload_parameters[key]);
          return acc;
        }, new FormData());

      formData.append('file', data);
      await axios.post(upload_url, formData);

      let statusCode = '';
      while (statusCode !== 'succeeded') {
        const mediafile = await (
          await this.fetch('https://api-sandbox.pinterest.com/v5/media/' + media_id, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
        ).json();

        await timer(3000);
        statusCode = mediafile.status;
        console.log('Video processing status:', statusCode);
      }

      mediaId = media_id;
      console.log('=== Video Upload Complete ===');
    }

    const mapImages = postDetails?.[0]?.media?.map((m) => ({
      path: m.path,
    }));

    console.log('=== Creating Pin ===');
    console.log('Board ID:', postDetails?.[0]?.settings.board);
    console.log('Title:', postDetails?.[0]?.settings.title);
    console.log('Link:', postDetails?.[0]?.settings.link);
    console.log('Description:', postDetails?.[0]?.message);
    console.log('Dominant Color:', postDetails?.[0]?.settings.dominant_color);
    console.log('Media Source:', mediaId ? 'video' : 'image');
    console.log('Mapped Images:', mapImages);

    try {
      const requestBody = {
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

      console.log('Request Body:', JSON.stringify(requestBody, null, 2));

      const response = await this.fetch('https://api-sandbox.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Pinterest API Response Status:', response.status);
      console.log('Pinterest API Response Headers:', Object.fromEntries(response.headers.entries()));

      const responseData = await response.json();
      console.log('Pinterest API Response Data:', JSON.stringify(responseData, null, 2));

      const { id: pId } = responseData;

      console.log('=== Pinterest Post Success ===');
      console.log('Pin ID:', pId);
      console.log('Release URL:', `https://www.pinterest.com/pin/${pId}`);

      return [
        {
          id: postDetails?.[0]?.id,
          postId: pId,
          releaseURL: `https://www.pinterest.com/pin/${pId}`,
          status: 'success',
        },
      ];
    } catch (err) {
      console.log('=== Pinterest Post Error ===');
      console.log('Error:', err);
      console.log('Error type:', err.constructor.name);
      console.log('Error message:', err.message);
      
      if (err instanceof RefreshToken) {
        console.log('RefreshToken error detected, re-throwing...');
        throw err;
      }
      
      console.log('Returning empty array for non-RefreshToken error');
      return [];
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
      await this.fetch(
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
