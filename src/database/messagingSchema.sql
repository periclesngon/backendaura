-- Messaging System Database Schema
-- Optimized for high-throughput real-time messaging

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For GIN indexes

-- Users table (if not exists)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    avatar_url TEXT,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL DEFAULT 'direct', -- direct, group, broadcast
    name VARCHAR(255), -- For group conversations
    description TEXT, -- For group conversations
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Conversation participants
CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member', -- member, admin, moderator
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(conversation_id, user_id)
);

-- Messages table with partitioning for scalability
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text', -- text, image, file, audio, video
    metadata JSONB, -- For additional data like file info, reactions, etc.
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    encryption_key_id VARCHAR(255), -- For end-to-end encryption
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (sent_at);

-- Create monthly partitions for messages (for better performance)
CREATE TABLE messages_2024_01 PARTITION OF messages
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE messages_2024_02 PARTITION OF messages
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE messages_2024_03 PARTITION OF messages
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
-- Add more partitions as needed

-- Message attachments
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message reactions
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

-- Message delivery status (for tracking delivery to multiple devices)
CREATE TABLE message_delivery_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255), -- For multi-device support
    status VARCHAR(20) NOT NULL, -- sent, delivered, read
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, device_id)
);

-- User presence
CREATE TABLE user_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'offline', -- online, away, busy, offline
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Typing indicators
CREATE TABLE typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 seconds'),
    UNIQUE(conversation_id, user_id)
);

-- Message search index (for full-text search)
CREATE TABLE message_search_index (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    content_vector tsvector,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message queue for processing
CREATE TABLE message_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_data JSONB NOT NULL,
    priority INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dead letter queue for failed messages
CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_message_id UUID,
    message_data JSONB NOT NULL,
    error_message TEXT NOT NULL,
    worker_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Performance indexes
CREATE INDEX CONCURRENTLY idx_messages_conversation_sent_at 
    ON messages(conversation_id, sent_at DESC);

CREATE INDEX CONCURRENTLY idx_messages_sender_sent_at 
    ON messages(sender_id, sent_at DESC);

CREATE INDEX CONCURRENTLY idx_messages_content_type 
    ON messages(content_type);

CREATE INDEX CONCURRENTLY idx_messages_metadata_gin 
    ON messages USING GIN(metadata);

CREATE INDEX CONCURRENTLY idx_conversation_participants_user_id 
    ON conversation_participants(user_id);

CREATE INDEX CONCURRENTLY idx_conversation_participants_conversation_id 
    ON conversation_participants(conversation_id);

CREATE INDEX CONCURRENTLY idx_message_delivery_status_message_user 
    ON message_delivery_status(message_id, user_id);

CREATE INDEX CONCURRENTLY idx_user_presence_user_id 
    ON user_presence(user_id);

CREATE INDEX CONCURRENTLY idx_typing_indicators_conversation 
    ON typing_indicators(conversation_id);

CREATE INDEX CONCURRENTLY idx_message_search_content 
    ON message_search_index USING GIN(content_vector);

CREATE INDEX CONCURRENTLY idx_message_queue_status_priority 
    ON message_queue(status, priority DESC, created_at);

-- Full-text search index
CREATE INDEX CONCURRENTLY idx_messages_content_search 
    ON messages USING GIN(to_tsvector('english', content));

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_presence_updated_at 
    BEFORE UPDATE ON user_presence 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET last_message_at = NEW.sent_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversation_last_message_trigger
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Trigger to update search index
CREATE OR REPLACE FUNCTION update_message_search_index()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO message_search_index (message_id, conversation_id, content_vector)
    VALUES (NEW.id, NEW.conversation_id, to_tsvector('english', NEW.content))
    ON CONFLICT (message_id) DO UPDATE SET
        content_vector = to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_message_search_index_trigger
    AFTER INSERT OR UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_message_search_index();

-- Cleanup function for expired typing indicators
CREATE OR REPLACE FUNCTION cleanup_expired_typing_indicators()
RETURNS void AS $$
BEGIN
    DELETE FROM typing_indicators 
    WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- Cleanup function for old messages (for data retention)
CREATE OR REPLACE FUNCTION cleanup_old_messages(retention_days INTEGER DEFAULT 365)
RETURNS void AS $$
BEGIN
    DELETE FROM messages 
    WHERE sent_at < NOW() - INTERVAL '1 day' * retention_days
    AND deleted_at IS NOT NULL;
END;
$$ language 'plpgsql';

-- Function to get conversation participants
CREATE OR REPLACE FUNCTION get_conversation_participants(conv_id UUID)
RETURNS TABLE(
    user_id UUID,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20),
    joined_at TIMESTAMP WITH TIME ZONE,
    last_read_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.user_id,
        u.first_name,
        u.last_name,
        cp.role,
        cp.joined_at,
        cp.last_read_at
    FROM conversation_participants cp
    JOIN users u ON cp.user_id = u.id
    WHERE cp.conversation_id = conv_id
    AND cp.is_active = TRUE;
END;
$$ language 'plpgsql';

-- Function to get recent messages for a conversation
CREATE OR REPLACE FUNCTION get_recent_messages(
    conv_id UUID,
    limit_count INTEGER DEFAULT 50,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    sender_id UUID,
    content TEXT,
    content_type VARCHAR(20),
    metadata JSONB,
    reply_to_id UUID,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    sender_first_name VARCHAR(100),
    sender_last_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.sender_id,
        m.content,
        m.content_type,
        m.metadata,
        m.reply_to_id,
        m.sent_at,
        m.delivered_at,
        m.read_at,
        u.first_name,
        u.last_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = conv_id
    AND m.deleted_at IS NULL
    ORDER BY m.sent_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ language 'plpgsql';

-- Views for common queries
CREATE VIEW active_conversations AS
SELECT 
    c.id,
    c.type,
    c.name,
    c.description,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.last_message_at,
    COUNT(cp.user_id) as participant_count
FROM conversations c
LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.is_active = TRUE
WHERE c.is_active = TRUE
GROUP BY c.id, c.type, c.name, c.description, c.created_by, c.created_at, c.updated_at, c.last_message_at;

CREATE VIEW user_conversations AS
SELECT 
    cp.user_id,
    c.id as conversation_id,
    c.type,
    c.name,
    c.description,
    c.last_message_at,
    cp.role,
    cp.joined_at,
    cp.last_read_at,
    CASE 
        WHEN c.last_message_at > cp.last_read_at THEN TRUE 
        ELSE FALSE 
    END as has_unread_messages
FROM conversation_participants cp
JOIN conversations c ON cp.conversation_id = c.id
WHERE cp.is_active = TRUE AND c.is_active = TRUE;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;
