package model

// BoardMention represents a @mention event within a board card/block.
type BoardMention struct {
	ID        string `json:"id" db:"id"`
	UserID    string `json:"user_id" db:"user_id"`
	SenderID  string `json:"sender_id" db:"sender_id"`
	BlockID   string `json:"block_id" db:"block_id"`
	BoardID   string `json:"board_id" db:"board_id"`
	CardID    string `json:"card_id" db:"card_id"`
	ChannelID string `json:"channel_id,omitempty" db:"channel_id"`
	Message   string `json:"message,omitempty" db:"message"`
	PostID    string `json:"post_id,omitempty" db:"post_id"`
	CreateAt  int64  `json:"create_at" db:"create_at"`
	RepliedAt int64  `json:"replied_at" db:"replied_at"`
}
