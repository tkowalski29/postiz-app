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

  private validateEnvironmentVariables(): void {
    const requiredVars = [
      'TIKTOK_CLIENT_ID',
      'TIKTOK_CLIENT_SECRET',
      'FRONTEND_URL'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required TikTok environment variables:', missingVars);
      throw new Error(`Missing required TikTok environment variables: ${missingVars.join(', ')}`);
    }

    console.log('TikTok environment variables validation passed');
  }

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

  private async checkAccountPermissions(accessToken: string): Promise<void> {
    try {
      console.log('Checking TikTok account permissions...');
      
      const response = await this.fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username,profile_deep_link,is_verified,follower_count,following_count,likes_count',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      const userInfo = await response.json();
      console.log('TikTok user info:', JSON.stringify(userInfo, null, 2));
      
      // Check if account is verified (optional but recommended)
      if (userInfo.data?.user?.is_verified) {
        console.log('TikTok account is verified');
      } else {
        console.log('TikTok account is not verified - this might affect upload capabilities');
      }
      
      // Check follower count (optional)
      const followerCount = userInfo.data?.user?.follower_count || 0;
      console.log(`TikTok account has ${followerCount} followers`);
      
    } catch (error) {
      console.error('Error checking TikTok account permissions:', error);
      // Don't throw error here, just log it - this is informational only
    }
  }

  private async uploadedVideoSuccess(
    id: string,
    publishId: string,
    accessToken: string
  ): Promise<{ url: string; id: number }> {
    let attempts = 0;
    const maxAttempts = 30; // Increased from 20 to 30 (90 seconds total)
    
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

      const { status, publicaly_available_post_id, fail_reason, downloaded_bytes } = post.data;

      if (status === 'FAILED') {
        console.error('TikTok upload failed:', JSON.stringify(post, null, 2));
        
        // Provide more specific error messages based on fail_reason
        let errorMessage = 'TikTok upload failed';
        if (fail_reason === 'internal') {
          errorMessage = 'TikTok internal processing error. This might be due to video format, size, or content restrictions.';
        } else if (fail_reason === 'invalid_video') {
          errorMessage = 'Video format is not supported by TikTok. Please ensure the video is in MP4 format and meets TikTok requirements.';
        } else if (fail_reason === 'video_too_large') {
          errorMessage = 'Video file is too large for TikTok. Please reduce the video size.';
        } else if (fail_reason === 'download_failed') {
          errorMessage = 'TikTok could not download the video from the provided URL. Please ensure the URL is publicly accessible.';
        } else if (fail_reason) {
          errorMessage = `TikTok upload failed: ${fail_reason}`;
        }
        
        // Log additional diagnostic information
        console.error('TikTok upload diagnostic info:', {
          fail_reason,
          downloaded_bytes,
          publish_id: publishId,
          timestamp: new Date().toISOString(),
          user_agent: 'TikTokBot/1.0'
        });
        
        throw new BadBody(
          'tiktok-error-upload',
          errorMessage,
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

      // Log progress for better debugging
      if (downloaded_bytes > 0) {
        console.log(`Download progress: ${downloaded_bytes} bytes downloaded`);
      }
      
      console.log(`Upload status: ${status}, waiting 3 seconds before next check...`);
      await timer(3000);
    }
    
    // If we reach here, we've exceeded max attempts
    throw new BadBody(
      'tiktok-error-upload',
      `Upload timeout after ${maxAttempts} attempts (${maxAttempts * 3} seconds). The video may be too large or TikTok servers are experiencing issues.`,
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

  private async validateVideoForTikTok(videoUrl: string): Promise<void> {
    try {
      // Check if URL is accessible
      const response = await fetch(videoUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TikTokBot/1.0)'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Video URL not accessible: ${response.status} ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('video/') && !contentType.includes('application/octet-stream')) {
        console.warn(`Warning: Content type may not be video: ${contentType}`);
      }

      // Check file size
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`Video size: ${sizeInMB.toFixed(2)} MB`);
        
        // TikTok recommended limits
        if (parseInt(contentLength) > 4 * 1024 * 1024 * 1024) { // 4GB
          throw new Error(`Video file is too large (${sizeInMB.toFixed(2)} MB). TikTok maximum is 4GB.`);
        }
        
        if (parseInt(contentLength) < 1024 * 1024) { // 1MB
          console.warn(`Video file seems very small (${sizeInMB.toFixed(2)} MB). This might cause issues.`);
        }
      }

      // Check if URL is HTTPS (TikTok requires secure URLs)
      if (!videoUrl.startsWith('https://')) {
        throw new Error('Video URL must use HTTPS protocol for TikTok uploads.');
      }

      // Check if URL is publicly accessible (basic check)
      if (videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
        throw new Error('Video URL must be publicly accessible. Local URLs are not supported.');
      }

    } catch (error) {
      console.error('Video validation failed:', error);
      throw error;
    }
  }

  private async checkVideoDuration(videoUrl: string, accessToken: string): Promise<void> {
    try {
      // Get max video length from TikTok API
      const { maxDurationSeconds } = await this.maxVideoLength(accessToken);
      console.log(`TikTok max video duration: ${maxDurationSeconds} seconds`);
      
      // Note: We can't easily check video duration from URL without downloading
      // This is just for logging purposes - actual duration check should be done on frontend
      console.log('Video duration check: Please ensure video is within TikTok limits on frontend');
      
    } catch (error) {
      console.error('Error checking video duration limits:', error);
      // Don't throw error here, just log it
    }
  }

  private checkContentRestrictions(postDetails: PostDetails<TikTokDto>): void {
    const message = postDetails.message || '';
    
    // Check for potentially problematic content
    const problematicKeywords = [
      'spam', 'scam', 'fake', 'clickbait', 'buy now', 'limited time',
      'free money', 'get rich quick', 'crypto', 'bitcoin', 'investment',
      'weight loss', 'diet pill', 'miracle cure', 'medical breakthrough'
    ];
    
    const allText = message.toLowerCase();
    const foundKeywords = problematicKeywords.filter(keyword => 
      allText.includes(keyword.toLowerCase())
    );
    
    if (foundKeywords.length > 0) {
      console.warn('Potential content restrictions detected:', foundKeywords);
      console.warn('TikTok may reject content containing these keywords');
    }
    
    // Check for excessive hashtags or mentions
    const hashtagCount = (message.match(/#/g) || []).length;
    const mentionCount = (message.match(/@/g) || []).length;
    
    if (hashtagCount > 20) {
      console.warn(`Too many hashtags (${hashtagCount}). TikTok recommends max 20 hashtags.`);
    }
    
    if (mentionCount > 5) {
      console.warn(`Too many mentions (${mentionCount}). This might affect video processing.`);
    }
    
    // Check for very short or very long text
    if (message.length < 5) {
      console.warn('Very short description. Consider adding more context.');
    }
    
    if (message.length > 2000) {
      console.warn('Description is very long. TikTok has character limits.');
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
    
    // Validate environment variables first
    this.validateEnvironmentVariables();
    
    // Check account permissions first
    await this.checkAccountPermissions(accessToken);
    
    // Check content restrictions
    this.checkContentRestrictions(firstPost);
    
    // Validate video URL and format
    if (firstPost?.media?.[0]?.path) {
      try {
        console.log('Validating video for TikTok upload:', firstPost.media[0].path);
        await this.validateVideoForTikTok(firstPost.media[0].path);
        await this.checkVideoDuration(firstPost.media[0].path, accessToken);
        console.log('Video validation passed');
      } catch (error) {
        console.error('Video validation failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        throw new BadBody(
          'tiktok-error-upload',
          `Video validation failed: ${errorMessage}`,
          Buffer.from(`Video validation failed: ${errorMessage}`)
        );
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
    
    // Add retry mechanism for the upload request
    let uploadAttempts = 0;
    const maxUploadAttempts = 3;
    let responseData;
    
    while (uploadAttempts < maxUploadAttempts) {
      try {
        uploadAttempts++;
        console.log(`Upload attempt ${uploadAttempts}/${maxUploadAttempts}`);
        
        const response = await this.fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });
        
        responseData = await response.json();
        console.log('TikTok API response:', JSON.stringify(responseData, null, 2));
        
        // Check if the response indicates an error
        if (responseData.error && responseData.error.code !== 'ok') {
          throw new Error(`TikTok API error: ${responseData.error.message || 'Unknown error'}`);
        }
        
        // If we get here, the upload was successful
        break;
        
      } catch (error) {
        console.error(`Upload attempt ${uploadAttempts} failed:`, error);
        
        if (uploadAttempts >= maxUploadAttempts) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
          throw new BadBody(
            'tiktok-error-upload',
            `Failed to initiate video upload after ${maxUploadAttempts} attempts: ${errorMessage}`,
            Buffer.from(errorMessage)
          );
        }
        
        // Wait before retrying
        console.log(`Waiting 5 seconds before retry...`);
        await timer(5000);
      }
    }
    
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