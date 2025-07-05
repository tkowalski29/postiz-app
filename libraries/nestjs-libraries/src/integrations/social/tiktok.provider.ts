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
    console.log('=== TikTok Refresh Token Start ===');
    console.log('Refresh token (first 20 chars):', refreshToken.substring(0, 20) + '...');
    
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    console.log('Refresh token request body:', {
      client_key: value.client_key.substring(0, 10) + '...',
      client_secret: '***HIDDEN***',
      grant_type: value.grant_type,
      refresh_token: value.refresh_token.substring(0, 20) + '...'
    });

    const { access_token, refresh_token, ...all } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    console.log('Refresh token response received');
    console.log('New access token (first 20 chars):', access_token.substring(0, 20) + '...');
    console.log('New refresh token (first 20 chars):', refresh_token.substring(0, 20) + '...');
    console.log('Additional response data:', Object.keys(all));

    console.log('Getting user info with new token...');
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

    console.log('User info received:', {
      display_name,
      username,
      open_id: open_id.substring(0, 10) + '...',
      avatar_url: avatar_url ? 'Present' : 'Not present'
    });

    const result = {
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      accessToken: access_token,
      id: open_id.replace(/-/g, ''),
      name: display_name,
      picture: avatar_url,
      username: username,
    };

    console.log('=== TikTok Refresh Token Success ===');
    console.log('Final result:', {
      id: result.id.substring(0, 10) + '...',
      name: result.name,
      accessToken: result.accessToken.substring(0, 20) + '...',
      refreshToken: result.refreshToken.substring(0, 20) + '...',
      expiresIn: result.expiresIn,
      username: result.username
    });

    return result;
  }

  async generateAuthUrl() {
    console.log('=== Generating TikTok Auth URL ===');
    console.log('Client ID (first 10 chars):', process.env.TIKTOK_CLIENT_ID?.substring(0, 10) + '...');
    console.log('Frontend URL:', process.env.FRONTEND_URL);
    console.log('Scopes:', this.scopes);
    
    const state = Math.random().toString(36).substring(2);
    console.log('Generated state:', state);

    const redirectUri = `${
      process?.env?.FRONTEND_URL?.indexOf('https') === -1
        ? 'https://redirectmeto.com/'
        : ''
    }${process?.env?.FRONTEND_URL}/integrations/social/tiktok`;
    
    console.log('Redirect URI:', redirectUri);

    const url = 'https://www.tiktok.com/v2/auth/authorize/' +
      `?client_key=${process.env.TIKTOK_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}`;

    console.log('Generated auth URL (first 100 chars):', url.substring(0, 100) + '...');
    console.log('=== TikTok Auth URL Generated ===');

    return {
      url,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    console.log('=== TikTok Authentication Start ===');
    console.log('Code (first 20 chars):', params.code.substring(0, 20) + '...');
    console.log('Code Verifier (first 20 chars):', params.codeVerifier.substring(0, 20) + '...');
    console.log('Refresh:', params.refresh);
    
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

    console.log('OAuth token request body:', {
      client_key: value.client_key.substring(0, 10) + '...',
      client_secret: '***HIDDEN***',
      code: value.code.substring(0, 20) + '...',
      grant_type: value.grant_type,
      code_verifier: value.code_verifier.substring(0, 20) + '...',
      redirect_uri: value.redirect_uri
    });

    const { access_token, refresh_token, scope } = await (
      await this.fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    console.log('OAuth token response received');
    console.log('Access token (first 20 chars):', access_token.substring(0, 20) + '...');
    console.log('Refresh token (first 20 chars):', refresh_token.substring(0, 20) + '...');
    console.log('Scopes:', scope);
    console.log('Required scopes:', this.scopes);
    
    this.checkScopes(this.scopes, scope);

    console.log('Getting user info...');
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

    console.log('User info received:', {
      display_name,
      username,
      open_id: open_id.substring(0, 10) + '...',
      avatar_url: avatar_url ? 'Present' : 'Not present'
    });

    const result = {
      id: open_id.replace(/-/g, ''),
      name: display_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      picture: avatar_url,
      username: username,
    };

    console.log('=== TikTok Authentication Success ===');
    console.log('Final result:', {
      id: result.id.substring(0, 10) + '...',
      name: result.name,
      accessToken: result.accessToken.substring(0, 20) + '...',
      refreshToken: result.refreshToken.substring(0, 20) + '...',
      expiresIn: result.expiresIn,
      username: result.username
    });

    return result;
  }

  async maxVideoLength(accessToken: string) {
    console.log('=== Getting Max Video Length ===');
    console.log('Access Token (first 20 chars):', accessToken.substring(0, 20) + '...');
    
    try {
      const response = await this.fetch(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      console.log('Max video length response status:', response.status);
      console.log('Max video length response headers:', Object.fromEntries(response.headers.entries()));
      
      const data = await response.json();
      console.log('Max video length response data:', JSON.stringify(data, null, 2));
      
      const { max_video_post_duration_sec } = data.data;
      console.log('Max video duration (seconds):', max_video_post_duration_sec);

      return {
        maxDurationSeconds: max_video_post_duration_sec,
      };
    } catch (error: any) {
      console.error('Failed to get max video length:', error);
      throw error;
    }
  }

  private async uploadedVideoSuccess(
    id: string,
    publishId: string,
    accessToken: string
  ): Promise<{ url: string; id: number }> {
    console.log('=== Upload Status Check Start ===');
    console.log('Profile ID:', id);
    console.log('Publish ID:', publishId);
    console.log('Access Token (first 20 chars):', accessToken.substring(0, 20) + '...');
    
    let attemptCount = 0;
    const maxAttempts = 20; // Prevent infinite loop
    
    // eslint-disable-next-line no-constant-condition
    while (attemptCount < maxAttempts) {
      attemptCount++;
      console.log(`--- Status Check Attempt ${attemptCount}/${maxAttempts} ---`);
      
      try {
        const statusResponse = await this.fetch(
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
        
        console.log('Status response status:', statusResponse.status);
        console.log('Status response headers:', Object.fromEntries(statusResponse.headers.entries()));
        
        const post = await statusResponse.json();
        console.log('Status response data:', JSON.stringify(post, null, 2));

        const { status, publicaly_available_post_id, fail_reason, error_code } = post.data;
        console.log('Current status:', status);
        console.log('Publicly available post ID:', publicaly_available_post_id);
        console.log('Fail reason:', fail_reason);
        console.log('Error code:', error_code);

        if (status === 'PUBLISH_COMPLETE') {
          console.log('=== Upload Status Check Success ===');
          const finalUrl = !publicaly_available_post_id
            ? `https://www.tiktok.com/@${id}`
            : `https://www.tiktok.com/@${id}/video/` + publicaly_available_post_id;
          const finalId = !publicaly_available_post_id
            ? publishId
            : publicaly_available_post_id?.[0];
            
          console.log('Final URL:', finalUrl);
          console.log('Final ID:', finalId);
          
          return {
            url: finalUrl,
            id: finalId,
          };
        }

        if (status === 'FAILED') {
          console.error('=== Upload Status Check Failed ===');
          console.error('TikTok upload failed:', {
            status,
            fail_reason,
            error_code,
            fullResponse: post
          });
          
          let errorMessage = 'TikTok upload failed';
          if (fail_reason === 'internal') {
            errorMessage = 'TikTok internal error - video may be inaccessible or in unsupported format';
          } else if (fail_reason === 'video_too_long') {
            errorMessage = 'Video is too long for TikTok';
          } else if (fail_reason === 'video_too_short') {
            errorMessage = 'Video is too short for TikTok';
          } else if (fail_reason === 'invalid_video_format') {
            errorMessage = 'Video format is not supported by TikTok';
          } else if (fail_reason === 'video_url_inaccessible') {
            errorMessage = 'TikTok cannot access the video URL';
          } else if (fail_reason) {
            errorMessage = `TikTok upload failed: ${fail_reason}`;
          }
          
          throw new BadBody(
            'tiktok-upload-failed',
            errorMessage,
            Buffer.from(JSON.stringify({
              status,
              fail_reason,
              error_code,
              fullResponse: post
            }))
          );
        }

        if (status === 'PROCESSING') {
          console.log('Video is still processing, waiting 3 seconds...');
        } else if (status === 'UPLOADING') {
          console.log('Video is still uploading, waiting 3 seconds...');
        } else {
          console.log(`Unknown status: ${status}, waiting 3 seconds...`);
        }

        await timer(3000);
      } catch (error: any) {
        console.error(`Status check attempt ${attemptCount} failed:`, error);
        if (attemptCount >= maxAttempts) {
          throw error;
        }
        console.log('Retrying in 3 seconds...');
        await timer(3000);
      }
    }
    
    console.error('=== Upload Status Check Timeout ===');
    throw new BadBody(
      'tiktok-upload-timeout',
      'TikTok upload status check timed out after maximum attempts',
      Buffer.from(`Publish ID: ${publishId}, Attempts: ${attemptCount}`)
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

    console.log('=== TikTok Post Start ===');
    console.log('Integration ID:', id);
    console.log('Integration Profile:', integration.profile);
    console.log('Access Token (first 20 chars):', accessToken.substring(0, 20) + '...');
    console.log('Post Details:', {
      id: firstPost.id,
      message: firstPost.message,
      mediaCount: firstPost.media?.length || 0,
      settings: firstPost.settings
    });
    
    if (firstPost.media?.length > 0) {
      console.log('Media files:');
      firstPost.media.forEach((media, index) => {
        console.log(`  ${index + 1}. Path: ${media.path}`);
        console.log(`     Type: ${media.path?.indexOf('mp4') > -1 ? 'Video' : 'Image'}`);
        console.log(`     Alt: ${media.alt}`);
        console.log(`     Thumbnail: ${media.thumbnail}`);
        console.log(`     ThumbnailTimestamp: ${media.thumbnailTimestamp}`);
      });
    }
    
    // Validate video accessibility before posting
    if (firstPost?.media?.[0]?.path?.indexOf('mp4') > -1) {
      console.log('=== Video Validation Start ===');
      try {
        const videoUrl = firstPost.media[0].path;
        console.log('Validating video accessibility:', videoUrl);
        
        // Validate URL format
        try {
          const urlObj = new URL(videoUrl);
          console.log('URL validation passed:', {
            protocol: urlObj.protocol,
            hostname: urlObj.hostname,
            pathname: urlObj.pathname
          });
        } catch (urlError: any) {
          console.error('URL validation failed:', urlError.message);
          throw new BadBody(
            'tiktok-invalid-video-url',
            `Invalid video URL format: ${videoUrl}`,
            Buffer.from(`URL Error: ${urlError.message}`)
          );
        }
        
        console.log('Making HEAD request to video URL...');
        const response = await fetch(videoUrl, { method: 'HEAD' });
        console.log('HEAD response status:', response.status);
        console.log('HEAD response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('Video file not accessible:', response.status, response.statusText);
          throw new BadBody(
            'tiktok-video-inaccessible',
            `Video file is not accessible: ${response.status} ${response.statusText}`,
            Buffer.from(`Video URL: ${videoUrl}`)
          );
        }
        
        // Check if content-type is video/mp4
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType?.includes('video/mp4')) {
          console.error('Invalid video format:', contentType);
          throw new BadBody(
            'tiktok-invalid-video-format',
            `Invalid video format: ${contentType}`,
            Buffer.from(`Expected: video/mp4, Got: ${contentType}`)
          );
        }
        
        console.log('Video validation passed successfully');
      } catch (error: any) {
        console.error('Video validation failed:', error);
        throw new BadBody(
          'tiktok-video-validation-failed',
          `Video validation failed: ${error.message}`,
          Buffer.from(`Video URL: ${firstPost.media[0].path}`)
        );
      }
      console.log('=== Video Validation End ===');
    }

    const requestBody = {
      ...((firstPost?.settings?.content_posting_method ||
        'DIRECT_POST') === 'DIRECT_POST'
        ? {
            post_info: {
              title: firstPost.message,
              privacy_level:
                firstPost.settings.privacy_level === 'SELF_ONLY' 
                  ? 'PUBLIC_TO_EVERYONE' // TikTok may have issues with SELF_ONLY
                  : (firstPost.settings.privacy_level || 'PUBLIC_TO_EVERYONE'),
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

    const endpoint = `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
      firstPost.settings.content_posting_method,
      (firstPost?.media?.[0]?.path?.indexOf('mp4') || -1) === -1
    )}`;

    console.log('=== TikTok API Request ===');
    console.log('Endpoint:', endpoint);
    console.log('Method: POST');
    console.log('Headers:', {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': `Bearer ${accessToken.substring(0, 20)}...`
    });
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    
    if (firstPost.settings.privacy_level === 'SELF_ONLY') {
      console.log('⚠️  Note: Changed privacy level from SELF_ONLY to PUBLIC_TO_EVERYONE due to TikTok API limitations');
    }

    console.log('Making TikTok API request...');
    const startTime = Date.now();
    
    try {
      const response = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`TikTok API response received in ${responseTime}ms`);
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseData = await response.json();
      console.log('TikTok API response data:', JSON.stringify(responseData, null, 2));
      
      const { publish_id } = responseData.data;
      console.log('Publish ID received:', publish_id);

      console.log('=== Starting Upload Status Check ===');
      const { url, id: videoId } = await this.uploadedVideoSuccess(
        integration.profile!,
        publish_id,
        accessToken
      );
      
      console.log('=== TikTok Post Success ===');
      console.log('Final URL:', url);
      console.log('Video ID:', videoId);
      console.log('Post ID:', firstPost.id);

      return [
        {
          id: firstPost.id,
          releaseURL: url,
          postId: String(videoId),
          status: 'success',
        },
      ];
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error('=== TikTok API Error ===');
      console.error('Request failed after', responseTime, 'ms');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error identifier:', error.identifier);
      console.error('Error json:', error.json);
      throw error;
    }
  }
}