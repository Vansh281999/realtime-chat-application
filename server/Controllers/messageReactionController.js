const MessageReaction = require("../Models/messageReactionModel");
const Message = require("../Models/messageModel");

// Add reaction to message
exports.addReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const userId = req.userId;

    if (!messageId || !emoji) {
      return res
        .status(400)
        .json({ message: "messageId and emoji are required" });
    }

    // Verify message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if user already reacted with this emoji
    let reaction = await MessageReaction.findOne({
      messageId,
      userId,
      emoji,
    });

    if (reaction) {
      return res
        .status(400)
        .json({ message: "You already reacted with this emoji" });
    }

    // Add reaction
    reaction = await MessageReaction.create({
      messageId,
      userId,
      emoji,
    });

    res.status(201).json({
      message: "Reaction added",
      reaction: await reaction.populate("userId", "email name"),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove reaction from message
exports.removeReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const userId = req.userId;

    if (!messageId || !emoji) {
      return res
        .status(400)
        .json({ message: "messageId and emoji are required" });
    }

    const reaction = await MessageReaction.findOneAndDelete({
      messageId,
      userId,
      emoji,
    });

    if (!reaction) {
      return res.status(404).json({ message: "Reaction not found" });
    }

    res.status(200).json({ message: "Reaction removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all reactions for a message
exports.getMessageReactions = async (req, res) => {
  try {
    const { messageId } = req.params;

    const reactions = await MessageReaction.find({ messageId })
      .populate("userId", "email name")
      .sort({ createdAt: 1 });

    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = [];
      }
      acc[reaction.emoji].push(reaction);
      return acc;
    }, {});

    // Convert to array format with counts
    const reactionSummary = Object.entries(groupedReactions).map(
      ([emoji, reactionList]) => ({
        emoji,
        count: reactionList.length,
        users: reactionList.map((r) => ({
          userId: r.userId._id,
          userName: r.userId.name,
          addedAt: r.createdAt,
        })),
      })
    );

    res.status(200).json({
      messageId,
      reactions: reactionSummary,
      totalReactions: reactions.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user's reactions in a chat
exports.getUserReactionsInChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Get all message IDs in chat
    const messages = await Message.find({ chatId }).select("_id");
    const messageIds = messages.map((m) => m._id);

    const reactions = await MessageReaction.find({
      messageId: { $in: messageIds },
      userId,
    })
      .populate("messageId", "text")
      .sort({ createdAt: -1 });

    res.status(200).json({
      reactions,
      count: reactions.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get popular reactions (emoji statistics)
exports.getEmojiStatistics = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Get all message IDs in chat
    const messages = await Message.find({ chatId }).select("_id");
    const messageIds = messages.map((m) => m._id);

    const emojiStats = await MessageReaction.aggregate([
      {
        $match: { messageId: { $in: messageIds } },
      },
      {
        $group: {
          _id: "$emoji",
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
        },
      },
      {
        $project: {
          emoji: "$_id",
          _id: 0,
          count: 1,
          uniqueUsers: { $size: "$uniqueUsers" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.status(200).json({
      chatId,
      emojiStatistics: emojiStats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check if user reacted with specific emoji
exports.checkUserReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.query;
    const userId = req.userId;

    if (!messageId || !emoji) {
      return res
        .status(400)
        .json({ message: "messageId and emoji are required" });
    }

    const reaction = await MessageReaction.findOne({
      messageId,
      userId,
      emoji,
    });

    res.status(200).json({
      hasReacted: !!reaction,
      reaction: reaction || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk get reactions for multiple messages
exports.bulkGetReactions = async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "messageIds array required" });
    }

    const reactions = await MessageReaction.find({
      messageId: { $in: messageIds },
    });

    // Group by message ID
    const groupedByMessage = messageIds.reduce((acc, msgId) => {
      acc[msgId] = reactions
        .filter((r) => r.messageId.toString() === msgId.toString())
        .reduce((msgReactions, reaction) => {
          if (!msgReactions[reaction.emoji]) {
            msgReactions[reaction.emoji] = [];
          }
          msgReactions[reaction.emoji].push(reaction.userId);
          return msgReactions;
        }, {});
      return acc;
    }, {});

    res.status(200).json({
      reactions: groupedByMessage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
