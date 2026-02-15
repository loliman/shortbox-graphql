import { StoryService } from '../src/services/StoryService';
import logger from '../src/util/logger';

jest.mock('../src/util/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('StoryService additional coverage', () => {
  let service: StoryService;
  let mockModels: any;

  beforeEach(() => {
    mockModels = {
      Story: {
        findAll: jest.fn(),
      },
    };
    service = new StoryService(mockModels, 'req-3');
    jest.clearAllMocks();
  });

  it('routes private log messages by level', () => {
    (service as any).log('info');
    (service as any).log('warn', 'warn');
    (service as any).log('error', 'error');

    expect((logger.info as jest.Mock).mock.calls[0][0]).toBe('info');
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe('warn');
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe('error');
  });

  it('maps getStoriesByIds to requested order and nulls', async () => {
    mockModels.Story.findAll.mockResolvedValue([
      { id: 2, fk_parent: 1 },
      { id: 1, fk_parent: null },
    ]);

    const result = await service.getStoriesByIds([1, 3, 2]);
    expect(result).toEqual([{ id: 1, fk_parent: null }, null, { id: 2, fk_parent: 1 }]);
  });
});
