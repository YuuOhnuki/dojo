'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ChevronLeft, LogOut } from 'lucide-react';
import { ActionButton } from './ui/action-button';

interface UserSettingsProps {
    onCancel?: () => void;
}

interface UserProfile {
    id: string;
    email: string;
    username: string;
    avatar?: string;
}

export const UserSettings: React.FC<UserSettingsProps> = ({ onCancel }) => {
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        avatar: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await fetch('/api/user/profile');
                if (response.ok) {
                    const data = await response.json();
                    setUserProfile(data);
                    setFormData((prev) => ({ ...prev, username: data.username, avatar: data.avatar || '' }));
                }
            } catch (err) {
                console.error('Failed to fetch profile:', err);
            }
        };

        if (session?.user) {
            fetchProfile();
        }
    }, [session]);

    if (!session?.user) {
        return (
            <Card className="w-full max-w-md p-6">
                <p className="text-center">ログインしてください</p>
            </Card>
        );
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            // パスワード変更の検証
            if (formData.newPassword) {
                if (!formData.currentPassword) {
                    throw new Error('現在のパスワードを入力してください');
                }
                if (formData.newPassword !== formData.confirmPassword) {
                    throw new Error('新しいパスワードが一致しません');
                }
                if (formData.newPassword.length < 6) {
                    throw new Error('パスワードは6文字以上である必要があります');
                }
            }

            const response = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.username,
                    avatar: formData.avatar || undefined,
                    currentPassword: formData.currentPassword || undefined,
                    newPassword: formData.newPassword || undefined,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '更新に失敗しました');
            }

            setSuccess('プロフィールが更新されました');
            setFormData((prev) => ({
                ...prev,
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            }));
            setIsEditing(false);

            // プロフィール情報を再読み込み
            const profileResponse = await fetch('/api/user/profile');
            if (profileResponse.ok) {
                const data = await profileResponse.json();
                setUserProfile(data);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut({ redirect: true, callbackUrl: '/' });
    };

    return (
        <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">ユーザー設定</h1>
                {onCancel && (
                    <ActionButton onClick={onCancel} variant="outline" icon={ChevronLeft} className="w-auto" size="sm">
                        戻る
                    </ActionButton>
                )}
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm dark:bg-red-900 dark:text-red-100">
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg text-sm dark:bg-green-900 dark:text-green-100">
                    {success}
                </div>
            )}

            {!isEditing ? (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1 dark:text-gray-400">
                            アイコン
                        </label>
                        <div className="text-4xl">{userProfile?.avatar || '😊'}</div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1 dark:text-gray-400">
                            ユーザー名
                        </label>
                        <div className="text-lg font-semibold">{userProfile?.username}</div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1 dark:text-gray-400">
                            メールアドレス
                        </label>
                        <div className="text-lg">{userProfile?.email}</div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button onClick={() => setIsEditing(true)} variant="default" className="flex-1">
                            編集
                        </Button>
                        <Button onClick={handleLogout} variant="destructive" className="flex-1 gap-2">
                            <LogOut className="w-4 h-4" />
                            ログアウト
                        </Button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">アイコン</label>
                        <div className="grid grid-cols-5 gap-2">
                            {['😊', '😎', '🤔', '😍', '🚀', '⭐', '🎯', '🏆', '💎', '🌟'].map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, avatar: emoji }))}
                                    className={`text-3xl p-2 rounded-lg transition-colors ${
                                        formData.avatar === emoji
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">ユーザー名</label>
                        <Input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            minLength={2}
                            maxLength={20}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="border-t pt-4 mt-4">
                        <h3 className="font-medium mb-3">パスワード変更（オプション）</h3>

                        <div>
                            <label className="block text-sm font-medium mb-1">現在のパスワード</label>
                            <Input
                                type="password"
                                name="currentPassword"
                                value={formData.currentPassword}
                                onChange={handleChange}
                                placeholder="パスワード変更時のみ必須"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">新しいパスワード</label>
                            <Input
                                type="password"
                                name="newPassword"
                                value={formData.newPassword}
                                onChange={handleChange}
                                placeholder="6文字以上"
                                minLength={6}
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">パスワード（確認）</label>
                            <Input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="パスワードを再入力"
                                minLength={6}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button type="submit" disabled={isLoading} className="flex-1">
                            {isLoading ? '更新中...' : '更新'}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            variant="outline"
                            className="flex-1"
                            disabled={isLoading}
                        >
                            キャンセル
                        </Button>
                    </div>
                </form>
            )}
        </Card>
    );
};
