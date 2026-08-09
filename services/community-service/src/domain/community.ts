import type { AccountEligibilityClient } from '../clients/account.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeOutbox } from '../lib/outbox.js';

export type ReportTarget = 'post' | 'comment';
export type ModerationAction = 'hide' | 'remove' | 'dismiss';
export type TicketCloseStatus = 'resolved' | 'closed';

const publicPostInclude = {
  comments: {
    where: { status: 'published' as const },
    orderBy: { createdAt: 'asc' as const },
  },
};

function forbidden(message: string): never {
  throw new AppError(403, 'FORBIDDEN', message);
}

async function requireEligiblePlayer(accountClient: AccountEligibilityClient, userId: string): Promise<void> {
  const lock = await prisma.accountLock.findUnique({ where: { userId } });
  if (lock?.locked) throw new AppError(403, 'ACCOUNT_LOCKED', 'Tài khoản đang bị khóa không thể tạo nội dung.');
  if (!await accountClient.isVerifiedPlayer(userId)) {
    throw new AppError(403, 'PLAYER_NOT_VERIFIED', 'Chỉ người chơi đã xác minh được thao tác cộng đồng.');
  }
}

export async function listPublishedPosts(page: number, pageSize: number) {
  return prisma.post.findMany({
    where: { status: 'published' },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

export async function getPublishedPost(postId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, status: 'published' }, include: publicPostInclude });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết công khai.');
  return post;
}

export async function createPost(accountClient: AccountEligibilityClient, authorUserId: string, body: string) {
  await requireEligiblePlayer(accountClient, authorUserId);
  return prisma.post.create({ data: { authorUserId, body } });
}

export async function editPost(accountClient: AccountEligibilityClient, postId: string, authorUserId: string, body: string) {
  await requireEligiblePlayer(accountClient, authorUserId);
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.');
  if (post.authorUserId !== authorUserId) forbidden('Chỉ tác giả được sửa bài viết.');
  if (post.status !== 'published') throw new AppError(409, 'POST_NOT_EDITABLE', 'Bài viết không còn có thể chỉnh sửa.');
  return prisma.post.update({ where: { id: postId }, data: { body, editedAt: new Date() } });
}

export async function removePost(accountClient: AccountEligibilityClient, postId: string, authorUserId: string) {
  await requireEligiblePlayer(accountClient, authorUserId);
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.');
  if (post.authorUserId !== authorUserId) forbidden('Chỉ tác giả được gỡ bài viết.');
  if (post.status === 'removed') return post;
  return prisma.post.update({ where: { id: postId }, data: { status: 'removed' } });
}

export async function createComment(
  accountClient: AccountEligibilityClient,
  postId: string,
  authorUserId: string,
  body: string,
) {
  await requireEligiblePlayer(accountClient, authorUserId);
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.');
  if (post.status !== 'published') throw new AppError(409, 'POST_NOT_COMMENTABLE', 'Không thể bình luận bài viết này.');
  return prisma.comment.create({ data: { postId, authorUserId, body } });
}

export async function removeComment(accountClient: AccountEligibilityClient, commentId: string, authorUserId: string) {
  await requireEligiblePlayer(accountClient, authorUserId);
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError(404, 'COMMENT_NOT_FOUND', 'Không tìm thấy bình luận.');
  if (comment.authorUserId !== authorUserId) forbidden('Chỉ tác giả được gỡ bình luận.');
  if (comment.status === 'removed') return comment;
  return prisma.comment.update({ where: { id: commentId }, data: { status: 'removed' } });
}

async function assertReportTargetExists(targetType: ReportTarget, targetId: string): Promise<void> {
  const target = targetType === 'post'
    ? await prisma.post.findUnique({ where: { id: targetId }, select: { id: true } })
    : await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Không tìm thấy nội dung cần báo cáo.');
}

export async function createReport(
  accountClient: AccountEligibilityClient,
  reporterUserId: string,
  targetType: ReportTarget,
  targetId: string,
  reason: string,
) {
  await requireEligiblePlayer(accountClient, reporterUserId);
  await assertReportTargetExists(targetType, targetId);
  try {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({ data: { reporterUserId, targetType, targetId, reason } });
      await writeOutbox(tx, {
        aggregateType: 'Report',
        aggregateId: report.id,
        eventType: 'ContentReported',
        payload: { reportId: report.id, targetType, targetId },
      });
      return report;
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'REPORT_ALREADY_EXISTS', 'Bạn đã báo cáo nội dung này.');
    }
    throw error;
  }
}

export async function listOpenReports() {
  return prisma.report.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'asc' } });
}

export async function moderateReport(
  reportId: string,
  adminUserId: string,
  action: ModerationAction,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Không tìm thấy báo cáo.');
    if (report.status !== 'open') throw new AppError(409, 'REPORT_ALREADY_RESOLVED', 'Báo cáo đã được xử lý.');

    if (action !== 'dismiss') {
      const target = report.targetType === 'post'
        ? await tx.post.findUnique({ where: { id: report.targetId }, select: { status: true } })
        : await tx.comment.findUnique({ where: { id: report.targetId }, select: { status: true } });
      if (!target) throw new AppError(404, 'REPORT_TARGET_NOT_FOUND', 'Không tìm thấy nội dung bị báo cáo.');
      if (target.status !== 'published') {
        throw new AppError(409, 'CONTENT_NOT_MODERATABLE', 'Nội dung không còn ở trạng thái công khai.');
      }
      if (report.targetType === 'post') {
        await tx.post.update({ where: { id: report.targetId }, data: { status: action === 'hide' ? 'hidden' : 'removed' } });
      } else {
        await tx.comment.update({ where: { id: report.targetId }, data: { status: action === 'hide' ? 'hidden' : 'removed' } });
      }
    }
    const updated = await tx.report.update({
      where: { id: report.id },
      data: { status: action === 'dismiss' ? 'dismissed' : 'actioned' },
    });
    await tx.moderationAudit.create({
      data: { adminUserId, action, targetType: report.targetType, targetId: report.targetId, reason },
    });
    return updated;
  });
}

export async function restoreContent(
  targetType: ReportTarget,
  targetId: string,
  adminUserId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const target = targetType === 'post'
      ? await tx.post.findUnique({ where: { id: targetId }, select: { status: true } })
      : await tx.comment.findUnique({ where: { id: targetId }, select: { status: true } });
    if (!target) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Không tìm thấy nội dung.');
    if (target.status !== 'hidden') {
      throw new AppError(409, 'CONTENT_NOT_RESTORABLE', 'Chỉ nội dung đang ẩn tạm mới có thể khôi phục.');
    }
    if (targetType === 'post') {
      await tx.post.update({ where: { id: targetId }, data: { status: 'published' } });
    } else {
      await tx.comment.update({ where: { id: targetId }, data: { status: 'published' } });
    }
    await tx.moderationAudit.create({
      data: { adminUserId, action: 'restore', targetType, targetId, reason },
    });
    return { targetType, targetId, status: 'published' as const };
  });
}

export async function createTicket(
  accountClient: AccountEligibilityClient,
  requesterUserId: string,
  subject: string,
  body: string,
) {
  await requireEligiblePlayer(accountClient, requesterUserId);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({ data: { requesterUserId, subject } });
    await tx.ticketMessage.create({
      data: { ticketId: ticket.id, senderUserId: requesterUserId, senderRole: 'player', body },
    });
    return ticket;
  });
}

export async function listTickets(userId: string, isAdmin: boolean) {
  return prisma.ticket.findMany({
    where: isAdmin ? undefined : { requesterUserId: userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTicket(ticketId: string, userId: string, isAdmin: boolean) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy ticket.');
  if (!isAdmin && ticket.requesterUserId !== userId) forbidden('Bạn không có quyền xem ticket này.');
  return ticket;
}

export async function addTicketMessage(
  accountClient: AccountEligibilityClient,
  ticketId: string,
  senderUserId: string,
  isAdmin: boolean,
  body: string,
) {
  if (!isAdmin) await requireEligiblePlayer(accountClient, senderUserId);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy ticket.');
    if (!isAdmin && ticket.requesterUserId !== senderUserId) forbidden('Bạn không có quyền trả lời ticket này.');
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw new AppError(409, 'TICKET_CLOSED', 'Ticket đã được giải quyết hoặc đóng.');
    }
    if (isAdmin && ticket.status === 'open') {
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'in_progress' } });
    }
    return tx.ticketMessage.create({
      data: { ticketId, senderUserId, senderRole: isAdmin ? 'admin' : 'player', body },
    });
  });
}

export async function setTicketStatus(ticketId: string, status: TicketCloseStatus) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy ticket.');
    const allowed = (ticket.status === 'in_progress' && status === 'resolved')
      || (ticket.status === 'resolved' && status === 'closed');
    if (!allowed) throw new AppError(409, 'INVALID_TICKET_TRANSITION', 'Chuyển trạng thái ticket không hợp lệ.');
    return tx.ticket.update({ where: { id: ticketId }, data: { status } });
  });
}
