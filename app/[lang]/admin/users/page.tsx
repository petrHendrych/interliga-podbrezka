import React from 'react';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users as usersTable } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import {
  Card, CardHeader, CardTitle, CardContent,
} from '@/components/ui/card';
import { approveUser } from '@/lib/admin-actions';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { DeleteUserButton } from './DeleteUserButton';

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  const userRows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isApproved: usersTable.isApproved,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  const pendingUsers = userRows.filter((u) => !u.isApproved);
  const approvedUsers = userRows.filter((u) => u.isApproved);

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-8xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">{dict.admin.users.title}</h1>
        <p className="text-muted-foreground">{dict.admin.users.description}</p>
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {dict.admin.users.pendingTitle}
              {' '}
              (
              {pendingUsers.length}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{dict.admin.users.noPending}</p>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <form action={approveUser.bind(null, user.id)}>
                        <Button type="submit" size="sm">{dict.admin.users.approve}</Button>
                      </form>
                      <DeleteUserButton
                        userId={user.id}
                        label={dict.admin.users.reject}
                        variant="destructive"
                        title={dict.admin.users.rejectTitle}
                        description={dict.admin.users.rejectDescription}
                        translations={{
                          cancel: dict.common.cancel,
                          delete: dict.common.delete,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {dict.admin.users.approvedTitle}
              {' '}
              (
              {approvedUsers.length}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            {approvedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{dict.admin.users.noApproved}</p>
            ) : (
              <div className="space-y-4">
                {approvedUsers.map((user) => (
                  <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                        {' '}
                        •
                        {user.role}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <DeleteUserButton
                        userId={user.id}
                        label={dict.admin.users.remove}
                        variant="ghost"
                        title={dict.admin.users.removeTitle}
                        description={dict.admin.users.removeDescription}
                        translations={{
                          cancel: dict.common.cancel,
                          delete: dict.common.delete,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
