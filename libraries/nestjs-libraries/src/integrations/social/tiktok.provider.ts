import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import dayjs from 'dayjs';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';

export class TiktokProvider extends SocialAbstract implements SocialProvider {
  identifier = 'tiktok';
  name = 'Tiktok';
  isBetweenSteps = false;
  convertToJPEG = true;
  scopes = [
    'user.info.basic',
    'video.publish',
    'video.upload',
    'user.info.profile',
  ];

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    const { access_token, refresh_token, ...all } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    const {
      data: {
        user: { avatar_url, display_name, open_id, username },
      },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      )
    ).json();

    return {
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      accessToken: access_token,
      id: open_id.replace(/-/g, ''),
      name: display_name,
      picture: avatar_url,
      username: username,
    };
  }

  async generateAuthUrl() {
    const state = Math.random().toString(36).substring(2);

    return {
      url:
        'https://www.tiktok.com/v2/auth/authorize/' +
        `?client_key=${process.env.TIKTOK_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(
          `${
            process?.env?.FRONTEND_URL?.indexOf('https') === -1
              ? 'https://redirectmeto.com/'
              : ''
          }${process?.env?.FRONTEND_URL}/integrations/social/tiktok`
        )}` +
        `&state=${state}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code: params.code,
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
      redirect_uri: `${
        process?.env?.FRONTEND_URL?.indexOf('https') === -1
          ? 'https://redirectmeto.com/'
          : ''
      }${process?.env?.FRONTEND_URL}/integrations/social/tiktok`,
    };

    const { access_token, refresh_token, scope } = await (
      await this.fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    console.log(this.scopes, scope);
    this.checkScopes(this.scopes, scope);

    const {
      data: {
        user: { avatar_url, display_name, open_id, username },
      },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      )
    ).json();

    return {
      id: open_id.replace(/-/g, ''),
      name: display_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      picture: avatar_url,
      username: username,
    };
  }

  async maxVideoLength(accessToken: string) {
    const {
      data: { max_video_post_duration_sec },
    } = await (
      await this.fetch(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return {
      maxDurationSeconds: max_video_post_duration_sec,
    };
  }

  private async uploadedVideoSuccess(
    id: string,
    publishId: string,
    accessToken: string
  ): Promise<{ url: string; id: number }> {
    let attempts = 0;
    const maxAttempts = 20; // Maximum 60 seconds (20 * 3 seconds)
    
    // eslint-disable-next-line no-constant-condition
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Checking upload status (attempt ${attempts}/${maxAttempts}) for publish_id: ${publishId}`);
      
      const response = await this.fetch(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            publish_id: publishId,
          }),
        }
      );
      
      const post = await response.json();
      console.log('Upload status response:', JSON.stringify(post, null, 2));

      const { status, publicaly_available_post_id } = post.data;



      if (status === 'FAILED') {
        console.error('TikTok upload failed:', JSON.stringify(post, null, 2));
        throw new BadBody(
          'tiktok-error-upload',
          JSON.stringify(post),
          Buffer.from(JSON.stringify(post))
        );
      }

      if (status === 'PUBLISH_COMPLETE') {
        console.log('TikTok upload completed successfully');
        return {
          url: !publicaly_available_post_id
            ? `https://www.tiktok.com/@${id}`
            : `https://www.tiktok.com/@${id}/video/` +
              publicaly_available_post_id,
          id: !publicaly_available_post_id
            ? publishId
            : publicaly_available_post_id?.[0],
        };
      }

      console.log(`Upload status: ${status}, waiting 3 seconds before next check...`);
      await timer(3000);
    }
    
    // If we reach here, we've exceeded max attempts
    throw new BadBody(
      'tiktok-error-upload',
      `Upload timeout after ${maxAttempts} attempts`,
      Buffer.from(`Upload timeout after ${maxAttempts} attempts`)
    );
  }

  private postingMethod(
    method: TikTokDto['content_posting_method'],
    isPhoto: boolean
  ): string {
    switch (method) {
      case 'UPLOAD':
        return isPhoto ? '/content/init/' : '/inbox/video/init/';
      case 'DIRECT_POST':
      default:
        return isPhoto ? '/content/init/' : '/video/init/';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost, ...comments] = postDetails;

    console.log('TikTok post details:', JSON.stringify(firstPost, null, 2));
    
    // Validate video URL
    if (firstPost?.media?.[0]?.path) {
      try {
        console.log('Checking video URL accessibility:', firstPost.media[0].path);
        const urlCheck = await fetch(firstPost.media[0].path, { 
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TikTokBot/1.0)'
          }
        });
        console.log('Video URL check status:', urlCheck.status, urlCheck.statusText);
        if (!urlCheck.ok) {
          throw new BadBody(
            'tiktok-error-upload',
            `Video URL is not accessible (${urlCheck.status}): ${firstPost.media[0].path}`,
            Buffer.from(`Video URL is not accessible (${urlCheck.status}): ${firstPost.media[0].path}`)
          );
        }
      } catch (error) {
        console.error('Error checking video URL:', error);
        // Don't throw error here, just log it - TikTok might still be able to access the URL
        console.warn('Video URL validation failed, but continuing with upload');
      }
    }
    const requestBody = {
      ...((firstPost?.settings?.content_posting_method ||
        'DIRECT_POST') === 'DIRECT_POST'
        ? {
            post_info: {
              title: firstPost.message || '',
              privacy_level:
                firstPost.settings.privacy_level || 'PUBLIC_TO_EVERYONE',
              disable_duet: !firstPost.settings.duet || false,
              disable_comment: !firstPost.settings.comment || false,
              disable_stitch: !firstPost.settings.stitch || false,
              brand_content_toggle:
                firstPost.settings.brand_content_toggle || false,
              brand_organic_toggle:
                firstPost.settings.brand_organic_toggle || false,
              ...((firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) ===
              -1
                ? {
                    auto_add_music:
                      firstPost.settings.autoAddMusic === 'yes',
                  }
                : {}),
            },
          }
        : {}),
      ...((firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) > -1
        ? {
            source_info: {
              source: 'PULL_FROM_URL',
              video_url: firstPost?.media?.[0]?.path!,
              ...(firstPost?.media?.[0]?.thumbnailTimestamp!
                ? {
                    video_cover_timestamp_ms:
                      firstPost?.media?.[0]?.thumbnailTimestamp!,
                  }
                : {}),
            },
          }
        : {
            source_info: {
              source: 'PULL_FROM_URL',
              photo_cover_index: 0,
              photo_images: firstPost.media?.map((p) => p.path),
            },
            post_mode: 'DIRECT_POST',
            media_type: 'PHOTO',
          }),
    };

    console.log('TikTok API request body:', JSON.stringify(requestBody, null, 2));

    const apiUrl = `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
      firstPost.settings.content_posting_method,
      (firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) === -1
    )}`;
    
    console.log('TikTok API URL:', apiUrl);
    
    const response = await this.fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseData = await response.json();
    console.log('TikTok API response:', JSON.stringify(responseData, null, 2));
    
    const {
      data: { publish_id },
    } = responseData;

    const { url, id: videoId } = await this.uploadedVideoSuccess(
      integration.profile!,
      publish_id,
      accessToken
    );

    return [
      {
        id: firstPost.id,
        releaseURL: url,
        postId: String(videoId),
        status: 'success',
      },
    ];
  }
}