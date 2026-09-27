import { IsIn, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class ListLeaveDto extends PaginationDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;
}
