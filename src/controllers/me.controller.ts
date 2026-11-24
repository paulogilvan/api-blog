import type { RequestHandler } from 'express';
import { env } from '../env.ts';
import { toMeOutputDTO } from '../dtos/me-output.dto.ts';
import { AppError } from '../errors/app-error.ts';
import { getAuthenticatedUser } from '../middlewares/ensure-authenticated.ts';
import { DrizzleUserRepository } from '../repositories/drizzle-user.repository.ts';
import type { UserProfileRecord, UserRepository } from '../repositories/user.repository.ts';
import type { UseCase } from '../use-cases/use-case.ts';
import {
  UpdateAvatarUseCase,
  type UpdateAvatarInput,
} from '../use-cases/users/update-avatar.use-case.ts';
import { DiskFileStorage } from '../utils/disk-file-storage.ts';
import type { FileStorage } from '../utils/file-storage.ts';
import type { ImageProcessor } from '../utils/image-processor.ts';
import { SharpImageProcessor } from '../utils/sharp-image-processor.ts';

// Composição: implementações concretas ligadas uma única vez, fora dos handlers.
const userRepository: UserRepository = new DrizzleUserRepository();
const imageProcessor: ImageProcessor = new SharpImageProcessor();
const fileStorage: FileStorage = new DiskFileStorage(env.UPLOAD_DIR);

const updateAvatar: UseCase<UpdateAvatarInput, UserProfileRecord> = new UpdateAvatarUseCase(
  userRepository,
  imageProcessor,
  fileStorage,
);

export const updateAvatarController: RequestHandler = async (req, res) => {
  const { id } = getAuthenticatedUser(req);

  // Do arquivo, só os bytes seguem adiante: nome original e mimetype vêm do cliente.
  const image = req.file?.buffer;
  if (!image) throw new AppError('VALIDATION_ERROR', 'Image is required');

  const user = await updateAvatar.execute({ userId: id, image });
  res.status(200).json(toMeOutputDTO(user));
};
