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
    await timer(6000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fetchResponse = await this.fetch(
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

      console.log('Status fetch HTTP status:', fetchResponse.status);
      console.log('Status fetch headers:', Object.fromEntries(Array.from(fetchResponse.headers.entries())));

      const post = await fetchResponse.json();

      console.log('Status fetch response body:');
      console.log(JSON.stringify(post, null, 2));

      const { status, publicaly_available_post_id } = post.data;

      if (status === 'PUBLISH_COMPLETE') {
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

      if (status === 'FAILED') {
        throw new BadBody(
          'titok-error-upload',
          JSON.stringify(post),
          Buffer.from(JSON.stringify(post))
        );
      }

      await timer(3000);
    }
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

    console.log(firstPost);
    
    // Check if video URL is accessible
    if (firstPost?.media?.[0]?.path?.indexOf('mp4') > -1) {
      try {
        const videoResponse = await fetch(firstPost.media[0].path, { method: 'HEAD' });
        console.log('Video URL accessibility check:', {
          url: firstPost.media[0].path,
          status: videoResponse.status,
          contentType: videoResponse.headers.get('content-type'),
          contentLength: videoResponse.headers.get('content-length')
        });
        
        if (!videoResponse.ok) {
          throw new BadBody(
            'tiktok-video-url-inaccessible',
            `Video URL is not accessible: ${videoResponse.status} ${videoResponse.statusText}`,
            Buffer.from(`Video URL is not accessible: ${videoResponse.status} ${videoResponse.statusText}`)
          );
        }
      } catch (error) {
        console.error('Error checking video URL accessibility:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new BadBody(
          'tiktok-video-url-error',
          `Error checking video URL: ${errorMessage}`,
          Buffer.from(`Error checking video URL: ${errorMessage}`)
        );
      }
    }
    var body = JSON.stringify({
      post_info: {
        title: firstPost.message,
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
            post_mode: 'DIRECT_POST',
            media_type: 'VIDEO',
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
    })
    const response = await (
      await this.fetch(
        `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
          'DIRECT_POST', // Force DIRECT_POST for now to test
          (firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) === -1
        )}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
          body: body,
        }
      )
    ).json();

    console.log('Full response:');
    console.log( `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
      'DIRECT_POST', // Force DIRECT_POST for now to test
      (firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) === -1
    )}`)
    console.log('Video URL:', firstPost?.media?.[0]?.path);
    console.log('Content posting method:', firstPost.settings.content_posting_method);
    console.log('Forced method:', 'DIRECT_POST');
    console.log(body);
    console.log(JSON.stringify(response, null, 2));

    const { publish_id } = response.data;

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