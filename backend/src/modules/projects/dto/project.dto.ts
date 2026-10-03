import {
  IsIn, IsInt, IsOptional, IsString, Length, Max, Min,
} from 'class-validator';

export class UpsertProjectDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @IsString()
  @Length(2, 20)
  code: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'ON_HOLD', 'COMPLETED'])
  status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
}

export class UpsertTeamDto {
  @IsString()
  @Length(2, 60)
  name: string;

  /**
   * How many members must still be available on any day a leave request
   * covers. Zero would mean the team can empty, which is not a policy
   * anybody sets on purpose — it is what an unset field looks like.
   */
  @IsInt()
  @Min(1, { message: 'A team needs at least one person available' })
  @Max(500)
  minimumStaff: number;

  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class SetMinimumDto {
  @IsInt()
  @Min(1, { message: 'A team needs at least one person available' })
  @Max(500)
  minimumStaff: number;
}

export class AddMemberDto {
  @IsInt()
  employeeId: number;

  /**
   * What they do on this team. Falls back to their designation.
   *
   * Separate on purpose: the same person can be a Backend Engineer on one
   * project and a Tech Lead on another, and cover is judged by what they do
   * on THIS one.
   */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  roleOnTeam?: string;
}
