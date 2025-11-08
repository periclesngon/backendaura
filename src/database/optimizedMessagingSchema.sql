-- Optimized Messaging Database Schema for High-Performance WhatsApp-Level Messaging
-- This schema is designed to handle 100,000+ messages per minute

-- Create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Optimized messages table with proper indexing
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    receiver_id UUID NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    subject VARCHAR(255) DEFAULT '',
    attachments JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    parent_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    -- Compression fields
    is_compressed BOOLEAN DEFAULT FALSE,
    original_size INTEGER,
    compressed_size INTEGER
);

-- High-performance indexes for message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created 
    ON messages (conversation_id, created_at DESC) 
    WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_created 
    ON messages (sender_id, created_at DESC) 
    WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_unread 
    ON messages (receiver_id, created_at DESC) 
    WHERE is_read = FALSE AND created_at > NOW() - INTERVAL '7 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_type_created 
    ON messages (message_type, created_at DESC) 
    WHERE created_at > NOW() - INTERVAL '7 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_parent_id 
    ON messages (parent_id) 
    WHERE parent_id IS NOT NULL;

-- Partial indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_recent_unread 
    ON messages (receiver_id, conversation_id, created_at DESC) 
    WHERE is_read = FALSE AND created_at > NOW() - INTERVAL '1 day';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_compressed 
    ON messages (is_compressed, original_size) 
    WHERE is_compressed = TRUE;

-- Optimized conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    type VARCHAR(50) NOT NULL DEFAULT 'individual',
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'
);

-- Conversation indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_type_active 
    ON conversations (type, is_active, last_activity DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_created_by 
    ON conversations (created_by, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_last_activity 
    ON conversations (last_activity DESC) 
    WHERE is_active = TRUE;

-- Optimized conversation participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    last_read_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    role VARCHAR(50) DEFAULT 'member',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (conversation_id, user_id)
);

-- Participant indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_user_active 
    ON conversation_participants (user_id, is_active, joined_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_conversation_active 
    ON conversation_participants (conversation_id, is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_last_read 
    ON conversation_participants (user_id, last_read_at DESC) 
    WHERE is_active = TRUE;

-- Message reactions table for engagement
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reaction_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, user_id, reaction_type)
);

-- Reaction indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reactions_message 
    ON message_reactions (message_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reactions_user 
    ON message_reactions (user_id, created_at DESC);

-- Message attachments table for file management
CREATE TABLE IF NOT EXISTS message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    thumbnail_url TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_processed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Attachment indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attachments_message 
    ON message_attachments (message_id, uploaded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attachments_type_size 
    ON message_attachments (file_type, file_size_bytes) 
    WHERE file_size_bytes > 1048576; -- Files larger than 1MB

-- User presence table for real-time status
CREATE TABLE IF NOT EXISTS user_presence (
    user_id UUID PRIMARY KEY,
    status VARCHAR(50) DEFAULT 'offline',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    socket_id VARCHAR(255),
    device_info JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Presence indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presence_status 
    ON user_presence (status, last_seen DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_presence_last_seen 
    ON user_presence (last_seen DESC) 
    WHERE status = 'online';

-- Message delivery status table for tracking
CREATE TABLE IF NOT EXISTS message_delivery_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'sent', 'delivered', 'read'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device_id VARCHAR(255),
    UNIQUE (message_id, user_id, status)
);

-- Delivery status indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_message 
    ON message_delivery_status (message_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_user_status 
    ON message_delivery_status (user_id, status, timestamp DESC);

-- Typing indicators table
CREATE TABLE IF NOT EXISTS typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    is_typing BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (conversation_id, user_id)
);

-- Typing indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_typing_conversation 
    ON typing_indicators (conversation_id, is_typing, last_activity DESC);

-- Message search index (for full-text search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_search 
    ON messages USING gin(to_tsvector('english', content)) 
    WHERE created_at > NOW() - INTERVAL '30 days';

-- Partitioning for large-scale message storage (optional)
-- This would be implemented for production with millions of messages
-- CREATE TABLE messages_2024_01 PARTITION OF messages 
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Views for common queries
CREATE OR REPLACE VIEW active_conversations AS
SELECT 
    c.*,
    COUNT(cp.user_id) as participant_count,
    m.content as last_message_content,
    m.created_at as last_message_at
FROM conversations c
LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.is_active = TRUE
LEFT JOIN messages m ON c.last_message_id = m.id
WHERE c.is_active = TRUE
GROUP BY c.id, m.content, m.created_at
ORDER BY c.last_activity DESC;

CREATE OR REPLACE VIEW user_unread_counts AS
SELECT 
    cp.user_id,
    cp.conversation_id,
    COUNT(m.id) as unread_count,
    MAX(m.created_at) as last_unread_at
FROM conversation_participants cp
LEFT JOIN messages m ON cp.conversation_id = m.conversation_id 
    AND m.receiver_id = cp.user_id 
    AND m.is_read = FALSE
    AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamp)
WHERE cp.is_active = TRUE
GROUP BY cp.user_id, cp.conversation_id;

-- Functions for performance optimization
CREATE OR REPLACE FUNCTION update_conversation_last_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET 
        last_message_id = NEW.id,
        last_activity = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update conversation activity
CREATE TRIGGER trigger_update_conversation_activity
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_activity();

-- Function to clean up old messages (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_messages(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Performance monitoring queries
CREATE OR REPLACE VIEW messaging_performance_stats AS
SELECT 
    'messages' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as last_24h,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_1h,
    AVG(LENGTH(content)) as avg_content_length,
    COUNT(*) FILTER (WHERE is_compressed = TRUE) as compressed_count
FROM messages
UNION ALL
SELECT 
    'conversations' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as last_24h,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_1h,
    0 as avg_content_length,
    0 as compressed_count
FROM conversations;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
