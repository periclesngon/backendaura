import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import LikeService, { LikeType } from '../services/likeService';
import { logger } from '../utils/logger';

const router = Router();

// Like/unlike content
router.post('/like', authenticate, async (req, res) => {
  try {
    const { contentId, contentType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!contentId || !contentType) {
      return res.status(400).json({ 
        success: false, 
        message: 'contentId and contentType are required' 
      });
    }

    if (!Object.values(LikeType).includes(contentType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid contentType. Must be POST or COMMENT' 
      });
    }

    const result = await LikeService.likeContent(userId, contentId, contentType);
    
    res.json({
      success: true,
      liked: result.liked,
      likeCount: result.likeCount,
      message: result.liked ? 'Content liked successfully' : 'Content unliked successfully'
    });
  } catch (error) {
    logger.error('Error in like endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get like status
router.get('/status/:contentId/:contentType', authenticate, async (req, res) => {
  try {
    const { contentId, contentType } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!Object.values(LikeType).includes(contentType as LikeType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid contentType. Must be POST or COMMENT' 
      });
    }

    const result = await LikeService.getLikeStatus(userId, contentId, contentType as LikeType);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error in like status endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get content likes
router.get('/content/:contentId/:contentType', async (req, res) => {
  try {
    const { contentId, contentType } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!Object.values(LikeType).includes(contentType as LikeType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid contentType. Must be POST or COMMENT' 
      });
    }

    const result = await LikeService.getContentLikes(
      contentId, 
      contentType as LikeType, 
      page, 
      limit
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error in content likes endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get user's liked content
router.get('/user', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const contentType = req.query.contentType as LikeType;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (contentType && !Object.values(LikeType).includes(contentType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid contentType. Must be POST or COMMENT' 
      });
    }

    const result = await LikeService.getUserLikes(userId, contentType, page, limit);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error in user likes endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get like statistics
router.get('/stats/:contentId/:contentType', async (req, res) => {
  try {
    const { contentId, contentType } = req.params;

    if (!Object.values(LikeType).includes(contentType as LikeType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid contentType. Must be POST or COMMENT' 
      });
    }

    const stats = await LikeService.getLikeStats(contentId, contentType as LikeType);
    
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    logger.error('Error in like stats endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

export default router;
