import cron from 'node-cron';

import logger from '../lib/logger.js';
import rolloverService from '../services/rollover.service.js';

const CRON_EXPRESSION = '59 23 * * *';

export const scheduleRolloverJob = (): cron.ScheduledTask => {
  logger.info('Scheduling rollover job', { expression: CRON_EXPRESSION });

  return cron.schedule(CRON_EXPRESSION, async () => {
    try {
      await rolloverService.runRollover();
    } catch (error) {
      logger.error('Rollover job failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
};
