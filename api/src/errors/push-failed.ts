import { BadGatewayException } from '@nestjs/common';

export class PushFailedException extends BadGatewayException {
  readonly publicCode: string;
  readonly publicMessage: string;

  constructor(stage: 'upload' | 'invalidation') {
    const message = stage === 'invalidation'
      ? 'Files were uploaded, but cache refresh failed. Contact an administrator before retrying.'
      : 'Resource push could not be completed. Some files may already have uploaded. Contact an administrator before retrying.';
    super(message);
    this.publicCode = stage === 'invalidation' ? 'PushCacheRefreshFailed' : 'PushFailed';
    this.publicMessage = message;
  }
}
